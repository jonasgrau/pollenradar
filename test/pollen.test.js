const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePollen, parseLevel, getPollen, resetCache, handlePollenRequest } = require("../lib/pollen");

const fixture = require("./fixtures/dwd-pollen.json");

// Copy of the real DWD file with custom values for Hamburg
function withHamburg(pollen, overrides = {}) {
  const data = structuredClone(fixture);
  const region = data.content.find((c) => c.partregion_id === 12);
  for (const [plant, values] of Object.entries(pollen)) region.Pollen[plant] = values;
  return Object.assign(data, overrides);
}

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test("parseLevel maps DWD codes to half steps", () => {
  assert.deepEqual(parseLevel("0"), { code: "0", step: 0, label: "keine" });
  assert.deepEqual(parseLevel("2-3"), { code: "2-3", step: 5, label: "mittel bis hoch" });
  assert.equal(parseLevel("3").step, 6);
});

test("parseLevel treats -1 and unknown codes as no forecast", () => {
  assert.equal(parseLevel("-1"), null);
  assert.equal(parseLevel(""), null);
  assert.equal(parseLevel(undefined), null);
  assert.equal(parseLevel("4"), null);
});

test("parsePollen picks the Hamburg region from the real DWD file", () => {
  const result = parsePollen(fixture);
  assert.equal(result.region, "Geest, Schleswig-Holstein und Hamburg");
  assert.equal(result.days.length, 3);
  for (const plant of ["Birke", "Erle", "Hasel", "Esche"]) {
    assert.ok(plant in result.days[0].levels, `${plant} present`);
  }
  assert.equal(result.source.publisher, "Deutscher Wetterdienst");
});

test("parsePollen gives each forecast a real date based on the issue date", () => {
  const result = parsePollen(withHamburg({}, { last_update: "2027-03-31 11:00 Uhr" }));
  assert.deepEqual(result.days.map((d) => d.date), ["2027-03-31", "2027-04-01", "2027-04-02"]);
});

test("parsePollen handles year boundaries", () => {
  const result = parsePollen(withHamburg({}, { last_update: "2026-12-31 11:00 Uhr" }));
  assert.deepEqual(result.days.map((d) => d.date), ["2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("parsePollen reads levels per day and keeps missing forecasts as null", () => {
  const result = parsePollen(withHamburg({ Birke: { today: "2-3", tomorrow: "3", dayafter_to: "-1" } }));
  const [today, tomorrow, dayafter] = result.days;
  assert.equal(today.levels.Birke.step, 5);
  assert.equal(tomorrow.levels.Birke.label, "hoch");
  assert.equal(dayafter.levels.Birke, null);
});

test("parsePollen fails clearly when the region or date is missing", () => {
  assert.throws(() => parsePollen({ content: [] }), /no partregion 12/);
  assert.throws(() => parsePollen(withHamburg({}, { last_update: "gestern" })), /Unexpected DWD date/);
});

test("getPollen caches for an hour", async (t) => {
  resetCache();
  t.after(resetCache);
  let calls = 0;
  const fetchImpl = async () => (calls++, okResponse(fixture));
  const now = Date.parse("2026-10-11T12:00:00Z");

  await getPollen({ fetchImpl, now });
  await getPollen({ fetchImpl, now: now + 30 * 60_000 });
  assert.equal(calls, 1);
  await getPollen({ fetchImpl, now: now + 61 * 60_000 });
  assert.equal(calls, 2);
});

test("getPollen falls back to the last good data when the DWD is down", async (t) => {
  resetCache();
  t.after(resetCache);
  const now = Date.parse("2026-10-11T12:00:00Z");
  await getPollen({ fetchImpl: async () => okResponse(fixture), now });

  const result = await getPollen({ fetchImpl: async () => ({ ok: false, status: 503 }), now: now + 2 * 3600_000 });
  assert.equal(result.stale, true);
  assert.equal(result.days.length, 3);
});

test("getPollen throws when the DWD is down and nothing is cached", async (t) => {
  resetCache();
  t.after(resetCache);
  await assert.rejects(getPollen({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /DWD HTTP 503/);
});

test("handlePollenRequest answers 502 with a German message on failure", async (t) => {
  resetCache();
  t.after(resetCache);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 500 }));
  t.mock.method(console, "error", () => {});

  const headers = {};
  const res = { statusCode: 0, body: "", setHeader: (k, v) => (headers[k] = v), end(b) { this.body = b; } };
  await handlePollenRequest({}, res);
  assert.equal(res.statusCode, 502);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.match(JSON.parse(res.body).error, /nicht erreichbar/);
});
