// The AI routes, with OpenAI stubbed out: prompt routing per extraction mode,
// request validation, error handling, and what the routes send back.
const test = require("node:test");
const assert = require("node:assert/strict");
const { extractCards } = require("../server/routes/extract");
const { analyzeEvidence, validEvidence } = require("../server/routes/analysis");
const prompts = require("../server/prompts");
const { callRoute, stubOpenAI, withoutKey } = require("./helpers");

const passage = "Dissolved oxygen, not temperature, controlled the first 72 hours of vitamin C loss.";
const request = (fields = {}) => ({ title: "Haddad 2021", url: "https://example.org/paper", question: "What drives vitamin C loss?", hypothesis: "Oxygen matters most.", pages: [{ label: "p. 2", text: passage }], ...fields });
const modelCard = (fields = {}) => ({ claim: "Dissolved oxygen controlled early vitamin C loss.", quotes: [{ quote: fields.quote || passage, page: "p. 2" }] });

for (const [mode, prompt] of [["content", "contentExtractionPrompt"], ["experiment", "experimentExtractionPrompt"], ["work", "experimentExtractionPrompt"], ["link", "linkExtractionPrompt"]]) {
  test(`extract-cards uses ${prompt} for mode "${mode}"`, async t => {
    const calls = stubOpenAI(t, () => ({ cards: [modelCard()] }));
    const { status, body } = await callRoute(extractCards, request({ mode }));
    assert.equal(status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].instructions, prompts[prompt]);
    assert.equal(calls[0].text.format.name, "lattice_card_extraction");
    assert.equal(calls[0].text.format.strict, true);
    assert.equal(body.cards.length, 1);
  });
}

test("extract-cards falls back to the content prompt for an unknown mode", async t => {
  const calls = stubOpenAI(t, () => ({ cards: [] }));
  await callRoute(extractCards, request({ mode: "something-else" }));
  assert.equal(calls[0].instructions, prompts.contentExtractionPrompt);
});

test("extract-cards sends the source URL only for links", async t => {
  const calls = stubOpenAI(t, () => ({ cards: [] }));
  await callRoute(extractCards, request({ mode: "link" }));
  await callRoute(extractCards, request({ mode: "content" }));
  assert.equal(calls[0].payload.source_url, "https://example.org/paper");
  assert.equal("source_url" in calls[1].payload, false);
});

test("extract-cards sends the question, hypothesis, and cleaned passages", async t => {
  const calls = stubOpenAI(t, () => ({ cards: [] }));
  await callRoute(extractCards, request({ hypothesis: "", pages: [{ label: "p. 1", text: "  spaced \t out \n\n here " }, { label: "p. 2", text: "" }] }));
  assert.deepEqual(calls[0].payload, { source_title: "Haddad 2021", research_question: "What drives vitamin C loss?", working_hypothesis: "Not provided", hypothesis_guesses: [], passages: [{ label: "p. 1", text: "spaced out\nhere" }] });
});

test("extract-cards drops cards whose quote isn't in the source and reports how many", async t => {
  stubOpenAI(t, () => ({ cards: [modelCard(), modelCard({ quote: "A sentence the source never contained at all." })] }));
  const { body } = await callRoute(extractCards, request());
  assert.equal(body.cards.length, 1);
  assert.equal(body.dropped, 1);
  assert.equal(body.truncated, false);
});

test("extract-cards passes through truncation reported by the browser", async t => {
  stubOpenAI(t, () => ({ cards: [] }));
  const { body } = await callRoute(extractCards, request({ truncated: true }));
  assert.equal(body.truncated, true);
});

test("extract-cards returns 503 without an API key and never calls OpenAI", async t => {
  withoutKey(t);
  const { status, body } = await callRoute(extractCards, request());
  assert.equal(status, 503);
  assert.match(body.error, /not configured/);
});

test("extract-cards returns 400 when no page has text", async t => {
  const calls = stubOpenAI(t, () => ({ cards: [] }));
  const { status } = await callRoute(extractCards, request({ pages: [{ label: "p. 1", text: "   " }] }));
  assert.equal(status, 400);
  assert.equal(calls.length, 0);
});

test("extract-cards returns 502 when the provider rejects the request", async t => {
  stubOpenAI(t, () => ({ status: 401 }));
  const { status, body } = await callRoute(extractCards, request());
  assert.equal(status, 502);
  assert.match(body.error, /provider/);
});

test("extract-cards returns 500 for invalid JSON", async t => {
  stubOpenAI(t, () => ({ cards: [] }));
  const { status } = await callRoute(extractCards, "{not json");
  assert.equal(status, 500);
});

const evidence = [{ id: "1", quote: passage, page: "p. 2 · Haddad 2021", origin: "external source" }, { id: "2", quote: "Our sealed bottles lost 12% in a week.", page: "Your text · Notes", origin: "researcher's own work" }];

const reading = (fields = {}) => ({ overview: "o", confidence: "medium", guesses: [], contradictions: [], gaps: [], ...fields });

test("evidence-analysis uses the analysis prompt and keeps only contradictions between two known pieces of evidence", async t => {
  const calls = stubOpenAI(t, () => reading({ contradictions: [{ title: "t", explanation: "e", resolve: "r", evidence_ids: ["1", "2"] }, { title: "u", explanation: "e", resolve: "r", evidence_ids: ["1", "99"] }] }));
  const { status, body } = await callRoute(analyzeEvidence, { question: "Q?", hypothesis: "", evidence });
  assert.equal(status, 200);
  assert.equal(calls[0].instructions, prompts.analysisPrompt);
  assert.equal(calls[0].payload.working_hypothesis, "Not provided");
  assert.deepEqual(body.analysis.contradictions.map(item => item.evidence_ids), [["1", "2"]]);
});

test("evidence-analysis requires a question and valid evidence", async t => {
  const calls = stubOpenAI(t, () => ({}));
  assert.equal((await callRoute(analyzeEvidence, { question: "", evidence })).status, 400);
  assert.equal((await callRoute(analyzeEvidence, { question: "Q?", evidence: [] })).status, 400);
  assert.equal(calls.length, 0);
});

test("evidence-analysis returns 503 without an API key", async t => {
  withoutKey(t);
  assert.equal((await callRoute(analyzeEvidence, { question: "Q?", evidence })).status, 503);
});

test("validEvidence accepts 1 to 24 complete items and trims long fields", () => {
  assert.equal(validEvidence(Array.from({ length: 25 }, () => evidence[0])), null);
  assert.equal(validEvidence(Array.from({ length: 24 }, () => evidence[0])).length, 24);
  assert.equal(validEvidence([{ id: "1", quote: "", page: "p. 1" }]), null);
  assert.equal(validEvidence("nope"), null);
  const [item] = validEvidence([{ id: "x".repeat(100), quote: "q".repeat(5000), page: "p" }]);
  assert.equal(item.id.length, 80);
  assert.equal(item.quote.length, 4000);
  assert.equal(item.origin, "external source");
});

test("evidence-analysis sends hypothesis guesses and relations between known items only", async t => {
  const { validGuesses, validRelations } = require("../server/routes/analysis");
  assert.deepEqual(validGuesses([{ id: "g1", claim: " Loss doubles per 10 °C. " }, { id: "", claim: "x" }, { id: "g2", claim: "" }]), [{ id: "g1", claim: "Loss doubles per 10 °C." }]);
  const ids = new Set(["1", "g1"]);
  assert.deepEqual(validRelations([{ from_id: "1", to_id: "g1", relation: "contradicts", rationale: "Q10 differs." }, { from_id: "1", to_id: "9", relation: "supports" }, { from_id: "1", to_id: "g1", relation: "likes" }], ids), [{ from_id: "1", to_id: "g1", relation: "contradicts", rationale: "Q10 differs." }]);
  const guess = (id, fields = {}) => ({ guess_id: id, verdict: "challenged", agreement: "", disagreement: "d", revision: "", suggestions: [], ...fields });
  const calls = stubOpenAI(t, () => reading({ guesses: [guess("g1"), guess("g1", { verdict: "supported" }), guess("nope")], contradictions: [{ title: "t", explanation: "e", resolve: "r", evidence_ids: ["1", "g1"] }], gaps: [{ title: "g", explanation: "e", research: "r", related_ids: ["1", "g1", "zzz"] }] }));
  const { body } = await callRoute(analyzeEvidence, { question: "Q?", hypothesis: "H", evidence: [{ id: "1", claim: "Oxygen dominates early loss.", quote: "Oxygen controlled the first 72 hours.", page: "p. 2" }], guesses: [{ id: "g1", claim: "Temperature dominates." }], relations: [{ from_id: "1", to_id: "g1", relation: "contradicts", rationale: "Opposite factors." }] });
  assert.deepEqual(calls[0].payload.hypothesis_guesses, [{ id: "g1", claim: "Temperature dominates." }]);
  assert.equal(calls[0].payload.relations.length, 1);
  assert.equal(calls[0].payload.evidence[0].claim, "Oxygen dominates early loss.");
  assert.deepEqual(body.analysis.guesses.map(item => [item.guess_id, item.verdict]), [["g1", "challenged"]]);
  assert.equal(body.analysis.contradictions.length, 0, "a guess is not one side of a contradiction between evidence");
  assert.deepEqual(body.analysis.gaps[0].related_ids, ["1", "g1"]);
});

test("extract-cards sends the current hypothesis guesses, cleaned and capped at five", async t => {
  const calls = stubOpenAI(t, () => ({ cards: [] }));
  await callRoute(extractCards, request({ guesses: [" Temperature   dominates. ", "", 42, "b", "c", "d", "e", "f"] }));
  assert.deepEqual(calls[0].payload.hypothesis_guesses, ["Temperature dominates.", "42", "b", "c"]);
  assert.match(prompts.contentExtractionPrompt, /hypothesis_guesses/);
});
