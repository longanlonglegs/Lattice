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
  const pairs = validPairs([{ id: "1|2", a: { claim: "Oxygen speeds loss", origin: "external source" }, b: { claim: "Temperature dominates", origin: "my experiment" } }, { id: "3|4", a: { claim: "p" }, b: { claim: "q" } }]);
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
  const pair = { id: "1|2", a: { claim: "Fridge cuts loss by two-thirds", origin: "my experiment" }, b: { claim: "4 °C cuts 21-day loss by about two-thirds", origin: "external source" } };
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

test("visibleEdges keeps every hypothesis link and only important or orphan evidence links, at most 2 per card", async () => {
  const { visibleEdges } = await load();
  const hypothesis = id => id >= 100;
  const edge = (a, b, relation, confidence) => ({ id: `${a}|${b}`, a, b, relation, confidence });
  const edges = [
    edge(1, 100, "supports", 0.6), edge(2, 100, "contradicts", 0.9), edge(3, 101, "refines", 0.7), // hypothesis links: always
    edge(1, 2, "supports", 0.95), // both anchored, not important: hidden
    edge(1, 3, "contradicts", 0.85), edge(1, 4, "same", 0.9), edge(1, 5, "explains", 0.95), // important, but card 1 may only keep 2
    edge(2, 3, "contradicts", 0.7), // important type, too unsure: hidden
    edge(6, 7, "supports", 0.65), edge(6, 8, "refines", 0.7), edge(6, 9, "supports", 0.6) // card 6 has no hypothesis link: its 2 strongest
  ];
  const shown = new Set(visibleEdges(edges, hypothesis).map(e => e.id));
  for (const id of ["1|100", "2|100", "3|101"]) assert.ok(shown.has(id), id);
  assert.ok(!shown.has("1|2"));
  assert.ok(!shown.has("2|3"));
  assert.deepEqual(["1|3", "1|4", "1|5"].filter(id => shown.has(id)), ["1|4", "1|5"]);
  assert.deepEqual(["6|7", "6|8", "6|9"].filter(id => shown.has(id)), ["6|7", "6|8"]);
});

test("hypothesisPairs pairs every idea with every hypothesis guess", async () => {
  const { hypothesisPairs } = await load();
  const pairs = hypothesisPairs([{ id: 5 }, { id: 7 }, { id: 1, hypothesis: true }, { id: 9, hypothesis: true }]);
  assert.deepEqual(pairs.map(pair => pair.id).sort(), ["1|5", "1|7", "5|9", "7|9"]);
});

test("needsAttention lists contradictions between evidence and guesses without evidence", async () => {
  const { needsAttention } = await load();
  const cards = [
    { id: 1, origin: "external" }, { id: 2, origin: "experiment" }, { id: 3, origin: "external" }, { id: 4, origin: "experiment" },
    { id: 10, origin: "hypothesis" }, { id: 11, origin: "hypothesis" }
  ];
  const edge = (a, b, relation, confidence = 0.8, direction = "a_to_b") => ({ id: `${a}|${b}`, a, b, relation, confidence, direction });
  const result = needsAttention(cards, [
    edge(1, 2, "contradicts", 0.7), edge(1, 3, "contradicts", 0.9), edge(2, 10, "contradicts", 0.95), // between evidence, strongest first; not against a guess
    edge(4, 11, "refines") // a refinement is not evidence for or against guess 11
  ]);
  assert.deepEqual(result.contradictions.map(e => e.id), ["1|3", "1|2"]);
  assert.deepEqual(result.unsupportedGuesses.map(c => c.id), [11]);
  assert.equal(result.total, 3);
});

test("relate passes each idea's evidence along, trimmed, and leaves it out when empty", async t => {
  const calls = stubOpenAI(t, () => ({ results: [] }));
  const pair = { id: "1|2", a: { claim: "Copper speeds loss", origin: "my experiment", evidence: `  Sealed bottles lost 22 percent.  ${"x".repeat(2000)}` }, b: { claim: "Temperature dominates", origin: "my hypothesis", evidence: "  " } };
  await callRoute(relatePairs, { question: "Q", pairs: [pair] });
  const sent = calls[0].payload.pairs[0];
  assert.ok(sent.a.evidence.startsWith("Sealed bottles lost 22 percent."));
  assert.equal(sent.a.evidence.length, 900);
  assert.equal("evidence" in sent.b, false);
});
