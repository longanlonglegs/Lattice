const { test } = require("node:test");
const assert = require("node:assert/strict");
const helpers = import("../src/research-recommendations.js");
const project = { id: "one", question: "How does storage affect vitamin C?", hypothesis: "Cold storage preserves vitamin C in citrus juice.", sources: [{ id: "s1", origin: "external", title: "paper.pdf", meta: { title: "Temperature and ascorbic acid retention in citrus", doi: "10.1234/saved" }, capturedText: "PRIVATE FULL TEXT" }, { origin: "experiment", title: "PRIVATE EXPERIMENT" }] };

test("recommendations derive queries from both the current hypothesis and paper titles without sending source text", async () => {
  const { recommendationContext } = await helpers;
  const context = recommendationContext(project);
  assert.equal(context.plans.length, 2);
  assert.match(context.plans[0].query, /cold storage/);
  assert.match(context.plans[1].query, /ascorbic acid/);
  assert.equal(JSON.stringify(context).includes("PRIVATE"), false);
  assert.equal(context.sources.length, 1);
  assert.notEqual(recommendationContext({ ...project, hypothesis: "Heat reduces ascorbic acid" }).key, context.key);
  assert.notEqual(recommendationContext({ ...project, sources: [] }).key, context.key);
});

test("recommendations exclude saved DOI variants, saved titles, duplicates, and unrelated results", async () => {
  const { recommendationContext, rankRecommendations } = await helpers;
  const candidates = [
    { doi: "https://doi.org/10.1234/SAVED", title: "Cold storage and citrus" },
    { doi: "10.1234/same-title", title: "Temperature and ascorbic acid retention in citrus" },
    { doi: "10.1234/new", title: "Vitamin C in cold storage of citrus juice" },
    { doi: "10.1234/NEW", title: "Duplicate cold storage" },
    { doi: "10.1234/other", title: "Electromagnetic field theory" }
  ];
  const results = rankRecommendations(candidates, recommendationContext(project));
  assert.equal(results.length, 1);
  assert.equal(results[0].doi, "10.1234/new");
  assert.match(results[0].reason, /hypothesis/);
  assert.doesNotMatch(results[0].reason, /supports|contradicts/);
});

test("source-only projects get reading suggestions with a traceable reason", async () => {
  const { recommendationContext, rankRecommendations } = await helpers;
  const context = recommendationContext({ sources: project.sources });
  assert.equal(context.plans.length, 1);
  const results = rankRecommendations([{ doi: "10.1234/new", title: "Ascorbic acid retention" }], context);
  assert.equal(results.length, 1);
  assert.match(results[0].reason, /Temperature and ascorbic acid/);
});

test("empty projects do not request recommendations, and cache keys isolate projects", async () => {
  const { recommendationContext } = await helpers;
  assert.equal(recommendationContext(null).plans.length, 0);
  assert.notEqual(recommendationContext(project).key, recommendationContext({ ...project, id: "two" }).key);
});
