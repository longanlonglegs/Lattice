// Question & hypothesis versions (Part 5): word diff, fallback split, and the split-hypothesis route.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanGuesses, splitHypothesis } = require("../server/routes/hypothesis");
const { callRoute, stubOpenAI, withoutKey } = require("./helpers");

const load = () => import("../src/records.js");
const hypothesis = "Vitamin C loss follows first-order kinetics. Its rate roughly doubles for every 10 °C rise, so refrigeration is the best way to preserve it.";

test("wordDiff marks added and removed words and merges runs", async () => {
  const { wordDiff } = await load();
  assert.deepEqual(wordDiff("temperature matters most", "oxygen matters most early on"), [
    { type: "del", text: "temperature" }, { type: "add", text: "oxygen" }, { type: "same", text: "matters most" }, { type: "add", text: "early on" }
  ]);
  assert.deepEqual(wordDiff("", "new text"), [{ type: "add", text: "new text" }]);
  assert.deepEqual(wordDiff("same", "same"), [{ type: "same", text: "same" }]);
});

test("sentenceGuesses makes one guess per sentence, at most five", async () => {
  const { sentenceGuesses } = await load();
  assert.deepEqual(sentenceGuesses(hypothesis).map(item => item.guess), ["Vitamin C loss follows first-order kinetics.", "Its rate roughly doubles for every 10 °C rise, so refrigeration is the best way to preserve it."]);
  assert.equal(sentenceGuesses("A. B. C. D. E. F. G.").length, 5);
  assert.deepEqual(sentenceGuesses("  "), []);
});

test("cleanGuesses keeps quotes found in the hypothesis and replaces the rest", () => {
  const guesses = cleanGuesses([
    { guess: " Vitamin C loss in orange juice follows first-order kinetics. ", quote: "Vitamin C loss follows first-order kinetics." },
    { guess: "Refrigeration best preserves vitamin C.", quote: "an invented quote" },
    { guess: "  ", quote: "x" }
  ], hypothesis);
  assert.equal(guesses.length, 2);
  assert.equal(guesses[0].guess, "Vitamin C loss in orange juice follows first-order kinetics.");
  assert.equal(guesses[0].quote, "Vitamin C loss follows first-order kinetics.");
  assert.equal(guesses[1].quote, hypothesis);
  assert.equal(cleanGuesses(Array.from({ length: 8 }, (_, i) => ({ guess: `g${i}`, quote: "" })), hypothesis).length, 5);
});

test("split-hypothesis sends the question and hypothesis and returns cleaned guesses", async t => {
  const calls = stubOpenAI(t, () => ({ guesses: [{ guess: "Vitamin C loss follows first-order kinetics.", quote: "Vitamin C loss follows first-order kinetics." }] }));
  const { status, body } = await callRoute(splitHypothesis, { question: "What drives vitamin C loss?", hypothesis });
  assert.equal(status, 200);
  assert.equal(body.guesses.length, 1);
  assert.deepEqual(calls[0].payload, { research_question: "What drives vitamin C loss?", working_hypothesis: hypothesis });
});

test("split-hypothesis returns 400 without a hypothesis and 503 without a key", async t => {
  const calls = stubOpenAI(t, () => ({ guesses: [] }));
  assert.equal((await callRoute(splitHypothesis, { hypothesis: "  " })).status, 400);
  assert.equal(calls.length, 0);
  withoutKey(t);
  assert.equal((await callRoute(splitHypothesis, { hypothesis })).status, 503);
});
