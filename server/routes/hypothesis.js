const { sendJson, readJson } = require("../json");
const { callOpenAI, guessesSchema } = require("../openai");
const { splitHypothesisPrompt } = require("../prompts");
const { normalizeForMatch } = require("./extract");

const MAX_GUESSES = 5;

// Keeps up to 5 non-empty guesses. A quote that isn't in the hypothesis is replaced by the whole hypothesis.
function cleanGuesses(guesses, hypothesis) {
  const source = normalizeForMatch(hypothesis);
  return (guesses || [])
    .map(item => ({ guess: String(item?.guess || "").replace(/\s+/g, " ").trim(), quote: String(item?.quote || "").replace(/\s+/g, " ").trim() }))
    .filter(item => item.guess)
    .slice(0, MAX_GUESSES)
    .map(item => ({ guess: item.guess, quote: item.quote && source.includes(normalizeForMatch(item.quote)) ? item.quote : hypothesis }));
}

async function splitHypothesis(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the local server" });
    return;
  }
  try {
    const body = await readJson(req);
    const hypothesis = String(body.hypothesis || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    if (!hypothesis) { sendJson(res, 400, { error: "There is no hypothesis to split" }); return; }
    const payload = { research_question: String(body.question || "").trim().slice(0, 4000) || "Not provided", working_hypothesis: hypothesis };
    const result = await callOpenAI(splitHypothesisPrompt, payload, "lattice_hypothesis_split", guessesSchema);
    sendJson(res, 200, { guesses: cleanGuesses(result.guesses, hypothesis) });
  } catch (error) {
    if (error.provider) sendJson(res, 502, { error: "the AI provider rejected the request" });
    else sendJson(res, 500, { error: "the AI response could not be read" });
  }
}

module.exports = { cleanGuesses, splitHypothesis };
