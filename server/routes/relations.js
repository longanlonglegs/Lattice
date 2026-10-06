const { sendJson, readJson } = require("../json");
const { callOpenAI, callEmbeddings, relationsSchema } = require("../openai");
const { relationPrompt } = require("../prompts");

const MAX_TEXTS = 100;
const MAX_PAIRS = 25;
const relations = ["supports", "contradicts", "refines", "same", "explains", "none"];
const directed = new Set(["supports", "refines", "explains"]);
const clip = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

function noKey(res) {
  if (process.env.OPENAI_API_KEY) return false;
  sendJson(res, 503, { error: "AI is not configured on the local server" });
  return true;
}

function providerError(res, error) {
  if (error.provider) sendJson(res, 502, { error: "the AI provider rejected the request" });
  else sendJson(res, 500, { error: "the AI response could not be read" });
}

// POST /api/embed { texts: [...] } -> { vectors: [[...], ...] }
async function embedTexts(req, res) {
  if (noKey(res)) return;
  try {
    const body = await readJson(req);
    const texts = Array.isArray(body.texts) ? body.texts.map(text => clip(text, 2000)) : [];
    if (!texts.length || texts.length > MAX_TEXTS || texts.some(text => !text)) { sendJson(res, 400, { error: `Send 1 to ${MAX_TEXTS} non-empty texts` }); return; }
    sendJson(res, 200, { vectors: await callEmbeddings(texts) });
  } catch (error) {
    providerError(res, error);
  }
}

function validPairs(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_PAIRS) return null;
  const idea = item => ({ claim: clip(item?.claim, 1000), origin: clip(item?.origin, 40) || "external source" });
  const pairs = input.map(pair => ({ id: clip(pair?.id, 120), a: idea(pair?.a), b: idea(pair?.b) }));
  return pairs.every(pair => pair.id && pair.a.claim && pair.b.claim) ? pairs : null;
}

// Keeps one well-formed result per requested pair; anything missing or malformed counts as "none".
function cleanResults(results, pairs) {
  const byId = new Map((results || []).map(item => [String(item?.id), item]));
  return pairs.map(({ id }) => {
    const item = byId.get(id);
    const relation = relations.includes(item?.relation) ? item.relation : "none";
    const direction = directed.has(relation) && ["a_to_b", "b_to_a"].includes(item?.direction) ? item.direction : directed.has(relation) ? "a_to_b" : "none";
    const confidence = Math.min(1, Math.max(0, Number(item?.confidence) || 0));
    return { id, relation, direction, confidence, rationale: clip(item?.rationale, 400) };
  });
}

// POST /api/relate { question, pairs: [{ id, a: { claim, origin }, b: { claim, origin } }] } -> { results }
async function relatePairs(req, res) {
  if (noKey(res)) return;
  try {
    const body = await readJson(req);
    const pairs = validPairs(body.pairs);
    if (!pairs) { sendJson(res, 400, { error: `Send 1 to ${MAX_PAIRS} pairs, each with an id and two claims` }); return; }
    const payload = { research_question: clip(body.question, 4000) || "Not provided", pairs };
    const result = await callOpenAI(relationPrompt, payload, "lattice_relations", relationsSchema);
    sendJson(res, 200, { results: cleanResults(result.results, pairs) });
  } catch (error) {
    providerError(res, error);
  }
}

module.exports = { validPairs, cleanResults, embedTexts, relatePairs };
