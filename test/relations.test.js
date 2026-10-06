// Relationship pipeline (Part 6): candidate pairs, relation labels, and the embed/relate routes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { validPairs, cleanResults, embedTexts, relatePairs } = require("../server/routes/relations");
const { callRoute, stubOpenAI, withoutKey } = require("./helpers");

const load = () => import("../src/relations.js");

test("cosine similarity", async () => {
  const { cosine } = await load();
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [1, 0]), 0);
});

test("candidatePairs takes the k nearest above the floor, skips the same group, and dedupes", async () => {
  const { candidatePairs } = await load();
  const nodes = [
    { id: 3, group: "s1", vector: [1, 0, 0] },
    { id: 1, group: "s2", vector: [0.9, 0.1, 0] },
    { id: 2, group: "s1", vector: [0.95, 0.05, 0] },
    { id: 4, group: "s3", vector: [0, 0, 1] }
  ];
  const pairs = candidatePairs(nodes, { k: 2, floor: 0.5 });
  assert.deepEqual(pairs.map(pair => pair.id).sort(), ["1|2", "1|3"]);
  assert.ok(pairs.every(pair => pair.a < pair.b));
  assert.deepEqual(candidatePairs(nodes, { k: 1, floor: 0.5 }).map(pair => pair.id).sort(), ["1|2", "1|3"]);
});

test("describeRelation reads a directed edge from either end", async () => {
  const { describeRelation, edgeIsCurrent } = await load();
  const edge = { a: 1, b: 2, relation: "explains", direction: "b_to_a", aText: "x", bText: "y" };
  assert.deepEqual(describeRelation(edge, 2), { label: "Explains", otherId: 1 });
  assert.deepEqual(describeRelation(edge, 1), { label: "Explained by", otherId: 2 });
  assert.deepEqual(describeRelation({ ...edge, relation: "contradicts", direction: "none" }, 1), { label: "Contradicts", otherId: 2 });
  assert.equal(edgeIsCurrent(edge, "x", "y"), true);
  assert.equal(edgeIsCurrent(edge, "x", "changed"), false);
});

test("validPairs and cleanResults keep requests and answers well-formed", () => {
  assert.equal(validPairs([]), null);
  assert.equal(validPairs([{ id: "1|2", a: { claim: "x" }, b: { claim: "" } }]), null);
  const pairs = validPairs([{ id: "1|2", a: { claim: "Oxygen speeds loss", origin: "external source" }, b: { claim: "Temperature dominates", origin: "my draft" } }, { id: "3|4", a: { claim: "p" }, b: { claim: "q" } }]);
  assert.equal(pairs[1].a.origin, "external source");
  const results = cleanResults([{ id: "1|2", relation: "contradicts", direction: "a_to_b", confidence: 1.7, rationale: " Opposite factors " }, { id: "x", relation: "supports" }], pairs);
  assert.deepEqual(results, [
    { id: "1|2", relation: "contradicts", direction: "none", confidence: 1, rationale: "Opposite factors" },
    { id: "3|4", relation: "none", direction: "none", confidence: 0, rationale: "" }
  ]);
  assert.equal(cleanResults([{ id: "1|2", relation: "refines", direction: "sideways", confidence: 0.5, rationale: "" }], pairs.slice(0, 1))[0].direction, "a_to_b");
});

test("relate sends the pairs and question and returns cleaned results", async t => {
  const calls = stubOpenAI(t, () => ({ results: [{ id: "1|2", relation: "supports", direction: "b_to_a", confidence: 0.8, rationale: "Both report a two-thirds cut." }] }));
  const pair = { id: "1|2", a: { claim: "Fridge cuts loss by two-thirds", origin: "my draft" }, b: { claim: "4 °C cuts 21-day loss by about two-thirds", origin: "external source" } };
  const { status, body } = await callRoute(relatePairs, { question: "What drives loss?", pairs: [pair] });
  assert.equal(status, 200);
  assert.deepEqual(body.results[0], { id: "1|2", relation: "supports", direction: "b_to_a", confidence: 0.8, rationale: "Both report a two-thirds cut." });
  assert.deepEqual(calls[0].payload, { research_question: "What drives loss?", pairs: [pair] });
  assert.equal((await callRoute(relatePairs, { pairs: Array.from({ length: 26 }, () => pair) })).status, 400);
});

test("embed returns vectors in input order and 503 without a key", async t => {
  const realFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (url !== "https://api.openai.com/v1/embeddings") throw new Error(`Unexpected fetch in test: ${url}`);
    requests.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }) };
  };
  const hadKey = "OPENAI_API_KEY" in process.env;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => { globalThis.fetch = realFetch; if (hadKey) process.env.OPENAI_API_KEY = oldKey; else delete process.env.OPENAI_API_KEY; });
  const { status, body } = await callRoute(embedTexts, { texts: ["first", "second"] });
  assert.equal(status, 200);
  assert.deepEqual(body.vectors, [[1, 0], [0, 1]]);
  assert.equal(requests[0].model, "text-embedding-3-small");
  assert.equal(requests[0].dimensions, 512);
  assert.equal((await callRoute(embedTexts, { texts: [] })).status, 400);
  withoutKey(t);
  assert.equal((await callRoute(embedTexts, { texts: ["x"] })).status, 503);
});
