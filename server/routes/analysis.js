const { sendJson, readJson } = require("../json");
const { callOpenAI, analysisSchema } = require("../openai");
const { analysisPrompt } = require("../prompts");

function validEvidence(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) return null;
  const evidence = input.map(item => ({
    id: String(item?.id || "").slice(0, 80),
    quote: String(item?.quote || "").trim().slice(0, 4000),
    page: String(item?.page || "").trim().slice(0, 250),
    origin: String(item?.origin || "external source").trim().slice(0, 40)
  }));
  return evidence.every(item => item.id && item.quote && item.page) ? evidence : null;
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

    const result = await callOpenAI(
      analysisPrompt,
      { research_question: question, working_hypothesis: hypothesis || "Not provided", evidence },
      "lattice_evidence_analysis",
      analysisSchema
    );
    const evidenceIds = new Set(evidence.map(item => item.id));
    result.tensions = (result.tensions || []).map(tension => ({
      ...tension,
      evidence_ids: (tension.evidence_ids || []).filter(id => evidenceIds.has(id))
    }));
    sendJson(res, 200, { analysis: result });
  } catch (error) {
    if (error.provider) sendJson(res, 502, { error: "The AI provider could not complete the analysis. Check the local API key and try again." });
    else sendJson(res, 500, { error: "Lattice could not prepare that analysis. Check the evidence and try again." });
  }
}

module.exports = { validEvidence, analyzeEvidence };
