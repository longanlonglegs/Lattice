const { sendJson, readJson } = require("../json");
const { MAX_SOURCE_CHARS, MAX_CARDS } = require("../config");
const { callOpenAI, cardsSchema } = require("../openai");
const { contentExtractionPrompt, experimentExtractionPrompt, draftExtractionPrompt, linkExtractionPrompt } = require("../prompts");

const promptByMode = { content: contentExtractionPrompt, link: linkExtractionPrompt, experiment: experimentExtractionPrompt, work: experimentExtractionPrompt, draft: draftExtractionPrompt };

function normalizeForMatch(text) {
  return String(text).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// A quote is checked sentence by sentence: every sentence (or "…"-separated part) must appear
// word-for-word, in order, on one page, so the model may skip text between them.
function quotePieces(quote) {
  return String(quote).split(/\s*(?:…|\.\.\.)\s*|(?<=[.!?])\s+/).map(text => ({ text, norm: normalizeForMatch(text) })).filter(piece => piece.norm);
}
// Returns the quote with " … " wherever text was skipped, or null if a piece isn't on the page in order.
function locateQuote(pieces, pageText) {
  let from = 0;
  let quote = "";
  for (const piece of pieces) {
    const at = pageText.indexOf(piece.norm, from);
    if (at < 0) return null;
    quote += quote ? (at === from ? " " : " … ") + piece.text : piece.text;
    from = at + piece.norm.length;
  }
  return pieces.length ? quote : null;
}

function capPages(input) {
  const pages = [];
  let total = 0;
  let truncated = false;
  for (const [index, item] of input.entries()) {
    const label = String(item?.label || "").trim().slice(0, 80);
    // Line breaks are kept: they separate a paper's title, author, and journal lines.
    let text = String(item?.text || "").replace(/[^\S\n]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    if (!label || !text) continue;
    if (total + text.length > MAX_SOURCE_CHARS) {
      text = text.slice(0, MAX_SOURCE_CHARS - total);
      truncated = true;
    }
    if (text) pages.push({ label, text });
    total += text.length;
    if (total >= MAX_SOURCE_CHARS) { truncated = truncated || input.slice(index + 1).some(rest => String(rest?.text || "").trim()); break; }
  }
  return { pages, truncated };
}

function verifiedCards(cards, pages) {
  const normalizedPages = pages.map(page => ({ label: page.label, text: normalizeForMatch(page.text) }));
  return (cards || []).flatMap(item => {
    const quote = String(item.quote || "").replace(/\s+/g, " ").trim();
    const pieces = quotePieces(quote);
    if (pieces.map(piece => piece.norm).join("").length < 20 || !String(item.claim || "").trim()) return [];
    const claimed = normalizedPages.find(page => page.label === item.page);
    const ordered = claimed ? [claimed, ...normalizedPages.filter(page => page !== claimed)] : normalizedPages;
    for (const page of ordered) {
      const located = locateQuote(pieces, page.text);
      if (located) return [{ claim: item.claim.trim(), quote: located, page: page.label }];
    }
    return [];
  }).slice(0, MAX_CARDS);
}

// Bibliographic details the model read off the page. Only used to fill gaps in a source's metadata.
function sourceInfo(info) {
  const text = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
  return { title: text(info?.title), authors: (Array.isArray(info?.authors) ? info.authors : []).map(text).filter(Boolean).slice(0, 50), year: text(info?.year), venue: text(info?.venue), doi: text(info?.doi) };
}

async function extractCards(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "AI is not configured on the local server" });
    return;
  }
  try {
    const body = await readJson(req);
    const mode = promptByMode[body.mode] ? body.mode : "content";
    const title = String(body.title || "Untitled source").trim().slice(0, 300);
    const { pages, truncated } = capPages(Array.isArray(body.pages) ? body.pages.slice(0, 2000) : []);
    if (!pages.length) {
      sendJson(res, 400, { error: "The source has no readable text" });
      return;
    }
    const payload = {
      source_title: title,
      ...(mode === "link" ? { source_url: String(body.url || "").slice(0, 2000) } : {}),
      research_question: String(body.question || "").trim().slice(0, 4000) || "Not provided",
      working_hypothesis: String(body.hypothesis || "").trim().slice(0, 4000) || "Not provided",
      passages: pages
    };
    const prompt = promptByMode[mode];
    const result = await callOpenAI(prompt, payload, "lattice_card_extraction", cardsSchema);
    const cards = verifiedCards(result.cards, pages);
    sendJson(res, 200, { cards, source_info: sourceInfo(result.source_info), truncated: truncated || Boolean(body.truncated), dropped: (result.cards || []).length - cards.length });
  } catch (error) {
    if (error.provider) sendJson(res, 502, { error: "the AI provider rejected the request" });
    else sendJson(res, 500, { error: "the AI response could not be read" });
  }
}

module.exports = { normalizeForMatch, capPages, verifiedCards, sourceInfo, extractCards };
