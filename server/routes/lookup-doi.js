const { sendJson, readJson } = require("../json");

const doiPattern = /^10\.\d{4,9}\/\S+$/;

function cleanDoi(value) {
  return String(value || "").trim().replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, "");
}

const stripTags = text => String(text || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// Crossref's work record -> { title, authors[], year, venue, doi, url }.
function crossrefToMeta(work) {
  const year = (work.issued || work["published-print"] || work["published-online"] || work.published)?.["date-parts"]?.[0]?.[0];
  return {
    title: stripTags(work.title?.[0]),
    authors: (work.author || []).map(person => [person.given, person.family].filter(Boolean).join(" ") || person.name || "").filter(Boolean),
    year: year ? String(year) : "",
    venue: stripTags(work["container-title"]?.[0] || work.publisher),
    doi: String(work.DOI || ""),
    url: String(work.URL || "")
  };
}

// Looks a DOI up on Crossref. Only the DOI is sent. Resolves to null when Crossref doesn't know it.
async function lookupDoi(doi) {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "Lattice research assistant (local app)", Accept: "application/json" }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Crossref responded with ${response.status}`);
  const body = await response.json();
  return body?.message ? crossrefToMeta(body.message) : null;
}

async function lookupDoiRoute(req, res) {
  try {
    const body = await readJson(req);
    const doi = cleanDoi(body.doi);
    if (!doiPattern.test(doi)) { sendJson(res, 400, { error: "That doesn't look like a DOI (it should start with 10.)" }); return; }
    const meta = await lookupDoi(doi);
    if (!meta) { sendJson(res, 404, { error: "Crossref doesn't know that DOI" }); return; }
    sendJson(res, 200, { meta });
  } catch (error) {
    sendJson(res, 502, { error: error.name === "TimeoutError" ? "Crossref took too long to respond" : "Lattice couldn't reach Crossref" });
  }
}

module.exports = { cleanDoi, doiPattern, crossrefToMeta, lookupDoi, lookupDoiRoute };
