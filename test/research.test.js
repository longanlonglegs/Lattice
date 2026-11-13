const { test } = require("node:test");
const assert = require("node:assert/strict");
const { researchRoute } = require("../server/routes/research");
const { callRoute, withoutKey } = require("./helpers");

test("research rejects invalid queries before contacting a provider", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Must not fetch"); });
  for (const body of [{}, null, { query: "ab" }, { query: "x".repeat(301) }, "invalid JSON"]) {
    assert.equal((await callRoute(researchRoute, body)).status, 400);
  }
});

test("research works without AI, sends only search terms, and returns deduplicated DOI citations", async t => {
  withoutKey(t);
  let requested;
  t.mock.method(globalThis, "fetch", async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ message: { items: [
      { title: ["<i>Vitamin C</i> stability"], DOI: "10.1234/test", URL: "javascript:bad()", author: [{ given: "A", family: "Researcher" }], issued: { "date-parts": [[2025]] }, abstract: "<p>Measured effects.</p>" },
      { title: ["Duplicate"], DOI: "10.1234/test" },
      { title: ["No identifier"] }
    ] } }) };
  });
  const result = await callRoute(researchRoute, { query: "vitamin C", recent: true, privateSource: "not for sharing" });
  assert.equal(result.status, 200);
  assert.equal(requested.hostname, "api.crossref.org");
  assert.equal(requested.searchParams.get("query"), "vitamin C");
  assert.match(requested.searchParams.get("filter"), /from-pub-date:/);
  assert.equal(requested.href.includes("not+for+sharing"), false);
  assert.equal(result.body.papers.length, 1);
  assert.equal(result.body.papers[0].url, "https://doi.org/10.1234/test");
  assert.equal(result.body.papers[0].title, "Vitamin C stability");
  assert.equal(result.body.papers[0].abstract, "Measured effects.");
});

test("research handles empty results and provider failures", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ message: { items: [] } }) }));
  assert.deepEqual((await callRoute(researchRoute, { query: "some topic" })).body.papers, []);
  mock.mock.mockImplementation(async () => ({ ok: false, status: 429 }));
  assert.equal((await callRoute(researchRoute, { query: "some topic" })).status, 502);
});
