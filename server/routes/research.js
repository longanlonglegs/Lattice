const { sendJson, readJson } = require("../json");
const { crossrefToMeta, doiPattern } = require("./lookup-doi");

// Search metadata, never generate citations. No project files or API key are sent.
async function researchRoute(req, res) {
  let body;
  try { body = await readJson(req); }
  catch { sendJson(res, 400, { error: "Send a valid search request." }); return; }
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 300) {
    sendJson(res, 400, { error: "Use between 3 and 300 characters for your search." }); return;
  }
  const params = new URLSearchParams({ query, rows: "12", filter: "type:journal-article", sort: "relevance" });
  if (body.recent === true) {
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - 3);
    params.set("filter", `type:journal-article,from-pub-date:${since.toISOString().slice(0, 10)}`);
  }
  try {
    const response = await fetch(`https://api.crossref.org/works?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Lattice research assistant (local app)", Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Search unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.message?.items)) throw new Error("Invalid search response");
    const seen = new Set();
    const papers = data.message.items.map(work => {
      const meta = crossrefToMeta(work);
      return { ...meta, url: `https://doi.org/${meta.doi}`, abstract: String(work.abstract || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000) };
    }).filter(paper => {
      const key = paper.doi.toLowerCase();
      if (!paper.title || !doiPattern.test(paper.doi) || seen.has(key)) return false;
      seen.add(key); return true;
    });
    sendJson(res, 200, { papers });
  } catch (error) {
    sendJson(res, 502, { error: error.name === "TimeoutError" ? "Paper search took too long. Please try again." : "Paper search is unavailable. Try again or use the search links below." });
  }
}

module.exports = { researchRoute };
