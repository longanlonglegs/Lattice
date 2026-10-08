const { sendJson, readJson } = require("../json");
const { callOpenAI, analysisSchema } = require("../openai");
const { analysisPrompt } = require("../prompts");

const MAX_EVIDENCE = 24;
const MAX_RELATIONS = 60;

function validEvidence(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_EVIDENCE) return null;
  const evidence = input.map(item => ({
    id: String(item?.id || "").slice(0, 80),
    claim: String(item?.claim || "").trim().slice(0, 1000),
    quote: String(item?.quote || "").trim().slice(0, 4000),
    page: String(item?.page || "").trim().slice(0, 250),
    origin: String(item?.origin || "external source").trim().slice(0, 40)
  }));
  return evidence.every(item => item.id && item.quote && item.page) ? evidence : null;
}

// The hypothesis split into guesses (up to 5); anything malformed is dropped.
function validGuesses(input) {
  return (Array.isArray(input) ? input : []).slice(0, 5)
    .map(item => ({ id: String(item?.id || "").slice(0, 80), claim: String(item?.claim || "").trim().slice(0, 1000) }))
    .filter(item => item.id && item.claim);
}

// Relations Lattice found between the items sent (up to 60), only between known ids.
function validRelations(input, ids) {
  const kinds = new Set(["supports", "contradicts", "refines", "same", "explains"]);
  return (Array.isArray(input) ? input : []).slice(0, MAX_RELATIONS)
    .map(item => ({ from_id: String(item?.from_id || ""), to_id: String(item?.to_id || ""), relation: String(item?.relation || ""), rationale: String(item?.rationale || "").trim().slice(0, 400) }))
    .filter(item => ids.has(item.from_id) && ids.has(item.to_id) && kinds.has(item.relation));
}

// Drops anything in the model's answer that points at items it wasn't sent: guess entries for unknown guesses,
// contradictions that aren't between two known pieces of evidence, and unknown IDs on gaps.
function keepKnownIds(result, evidenceIds, guessIds) {
  const known = id => evidenceIds.has(id) || guessIds.has(id);
  const seen = new Set();
  return {
    ...result,
    guesses: (result.guesses || []).filter(item => guessIds.has(item.guess_id) && !seen.has(item.guess_id) && seen.add(item.guess_id)),
    contradictions: (result.contradictions || [])
      .map(item => ({ ...item, evidence_ids: [...new Set((item.evidence_ids || []).filter(id => evidenceIds.has(id)))].slice(0, 2) }))
      .filter(item => item.evidence_ids.length === 2),
    gaps: (result.gaps || []).map(item => ({ ...item, related_ids: (item.related_ids || []).filter(known) }))
  };
}

async function analyzeEvidence(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured. Start Lattice with OPENAI_API_KEY set on the local server." });
    return;
  }

  try {
    const body = await readJson(req);
    const question = String(body.question || "").trim().slice(0, 8000);
    const hypothesis = String(body.hypothesis || "").trim().slice(0, 8000);
    const evidence = validEvidence(body.evidence);
    if (!question || !evidence) {
      sendJson(res, 400, { error: "Add a research question and at least one source-anchored passage before running an analysis." });
      return;
    }

    const guesses = validGuesses(body.guesses);
    const evidenceIds = new Set([...evidence, ...guesses].map(item => item.id));
    const relations = validRelations(body.relations, evidenceIds);
    const result = await callOpenAI(
      analysisPrompt,
      { research_question: question, working_hypothesis: hypothesis || "Not provided", hypothesis_guesses: guesses, evidence, relations },
      "lattice_evidence_analysis",
      analysisSchema
    );
    sendJson(res, 200, { analysis: keepKnownIds(result, new Set(evidence.map(item => item.id)), new Set(guesses.map(item => item.id))) });
  } catch (error) {
    if (error.provider) sendJson(res, 502, { error: "The AI provider could not complete the analysis. Check the local API key and try again." });
    else sendJson(res, 500, { error: "Lattice could not prepare that analysis. Check the evidence and try again." });
  }
}

module.exports = { validEvidence, validGuesses, validRelations, keepKnownIds, analyzeEvidence };
