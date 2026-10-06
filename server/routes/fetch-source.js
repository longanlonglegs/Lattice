const { sendJson, readJson } = require("../json");
const { MAX_SOURCE_CHARS, MAX_DOWNLOAD_BYTES } = require("../config");
const { normalizeForMatch } = require("./extract");
const { cleanDoi, doiPattern, lookupDoi } = require("./lookup-doi");

function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0"
    || /^(127|10)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^f[cd][0-9a-f]{2}:/.test(host);
}

function normalizeSourceUrl(value) {
  let input = String(value || "").trim();
  const doi = input.match(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i);
  if (doi) input = `https://doi.org/${doi[1]}`;
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url;
  try { url = new URL(input); } catch { throw new Error("That doesn't look like a valid link or DOI"); }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) throw new Error("That link can't be fetched");
  const arxiv = url.hostname.replace(/^www\./, "") === "arxiv.org" && url.pathname.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/);
  // The abstract page carries the paper title and a citation_pdf_url pointing at the full PDF.
  if (arxiv) return new URL(`https://arxiv.org/abs/${arxiv[1]}`);
  return url;
}

async function fetchWithLimits(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop < 6; hop += 1) {
    if (isPrivateHost(url.hostname)) throw new Error("That link redirects somewhere Lattice won't fetch");
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Lattice research assistant)", Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location"), url);
      continue;
    }
    if (!response.ok) throw new Error(`The site responded with ${response.status}`);
    if (Number(response.headers.get("content-length") || 0) > MAX_DOWNLOAD_BYTES) throw new Error("That file is too large to read");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("That file is too large to read");
    return { url, bytes, contentType: response.headers.get("content-type") || "" };
  }
  throw new Error("That link redirects too many times");
}

async function pdfPages(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  try {
    const pages = [];
    let total = 0;
    let lastRead = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages && total < MAX_SOURCE_CHARS; pageNo += 1) {
      lastRead = pageNo;
      const page = await pdf.getPage(pageNo);
      const text = (await page.getTextContent()).items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) { pages.push({ label: `p. ${pageNo}`, text }); total += text.length; }
    }
    const info = (await pdf.getMetadata().catch(() => null))?.info || {};
    const pdfInfo = { title: String(info.Title || "").trim(), author: String(info.Author || "").trim(), date: String(info.CreationDate || "") };
    return { pages, totalPages: pdf.numPages, truncated: lastRead < pdf.numPages, pdfInfo };
  } finally {
    await pdf.destroy();
  }
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

function metaAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\s${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? (match[1] ?? match[2]) : "";
}

function metaContent(html, names) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const name of names) {
    for (const tag of tags) {
      const key = (metaAttribute(tag, "name") || metaAttribute(tag, "property")).toLowerCase();
      const content = metaAttribute(tag, "content").trim();
      if (key === name.toLowerCase() && content) return decodeEntities(content);
    }
  }
  return "";
}

function metaAll(html, name) {
  return (html.match(/<meta\b[^>]*>/gi) || [])
    .filter(tag => (metaAttribute(tag, "name") || metaAttribute(tag, "property")).toLowerCase() === name)
    .map(tag => decodeEntities(metaAttribute(tag, "content").trim()))
    .filter(Boolean);
}

// Citation details from the citation_* and Dublin Core meta tags that arXiv and publishers put on landing pages.
function pageMeta(html, url) {
  const authors = metaAll(html, "citation_author");
  const doi = cleanDoi(metaContent(html, ["citation_doi", "dc.identifier"]));
  return {
    title: metaContent(html, ["citation_title", "dc.title"]),
    authors: authors.length ? authors : metaAll(html, "dc.creator"),
    date: metaContent(html, ["citation_publication_date", "citation_date", "citation_online_date", "dc.date"]),
    venue: metaContent(html, ["citation_journal_title", "citation_conference_title", "citation_publisher", "dc.publisher"]) || (/(^|\.)arxiv\.org$/i.test(url.hostname) ? "arXiv" : ""),
    doi: doiPattern.test(doi) ? doi : ""
  };
}

// The DOI a doi.org link points at, if any.
function doiFromUrl(url) {
  if (!/^(dx\.)?doi\.org$/i.test(url.hostname)) return "";
  const doi = cleanDoi(decodeURIComponent(url.pathname.slice(1)));
  return doiPattern.test(doi) ? doi : "";
}

// Crossref fills in what the page didn't say, when a DOI is known. Failures are ignored.
async function crossrefFor(meta) {
  if (!meta.doi || (meta.authors?.length && meta.date && meta.venue)) return null;
  return lookupDoi(meta.doi).catch(() => null);
}

function htmlToText(html) {
  let body = html.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, " ");
  const main = body.match(/<(article|main)\b[\s\S]*?<\/\1>/i)?.[0];
  if (main && main.replace(/<[^>]+>/g, "").trim().length > 800) body = main;
  body = body.replace(/<\/?(p|div|section|h[1-6]|li|tr|blockquote|br)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  return decodeEntities(body).split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(line => line.length > 1).join("\n");
}

async function fetchSource(req, res) {
  try {
    const body = await readJson(req);
    let target;
    try { target = normalizeSourceUrl(body.url); } catch (error) { sendJson(res, 400, { error: error.message || "That doesn't look like a valid link or DOI" }); return; }
    const fetched = await fetchWithLimits(target);
    const isPdf = /pdf/i.test(fetched.contentType) || fetched.bytes.subarray(0, 5).toString() === "%PDF-";
    if (isPdf) {
      const pdf = await pdfPages(fetched.bytes);
      if (!pdf.pages.length) throw new Error("That PDF has no selectable text (it may be scanned)");
      const meta = { doi: doiFromUrl(target) };
      sendJson(res, 200, { title: pdf.pdfInfo.title || decodeURIComponent(fetched.url.pathname.split("/").pop() || fetched.url.hostname), finalUrl: fetched.url.href, format: "pdf", ...pdf, meta, crossref: await crossrefFor(meta) });
      return;
    }
    const html = fetched.bytes.toString("utf8");
    const title = metaContent(html, ["citation_title", "og:title", "dc.title"]) || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim() || fetched.url.hostname;
    const meta = pageMeta(html, fetched.url);
    meta.doi = meta.doi || doiFromUrl(target);
    const crossref = await crossrefFor(meta);
    const pdfUrl = metaContent(html, ["citation_pdf_url"]);
    if (pdfUrl) {
      try {
        const linked = await fetchWithLimits(new URL(pdfUrl, fetched.url));
        if (/pdf/i.test(linked.contentType) || linked.bytes.subarray(0, 5).toString() === "%PDF-") {
          const pdf = await pdfPages(linked.bytes);
          if (pdf.pages.length) { sendJson(res, 200, { title, finalUrl: fetched.url.href, format: "pdf", ...pdf, meta, crossref }); return; }
        }
      } catch { /* Paywalled or blocked PDF: fall back to the landing page text. */ }
    }
    const abstract = metaContent(html, ["citation_abstract", "dc.description", "og:description", "description"]);
    let text = htmlToText(html);
    if (abstract && !normalizeForMatch(text).includes(normalizeForMatch(abstract).slice(0, 200))) text = `${abstract}\n${text}`;
    if (text.length < 200) throw new Error("Lattice couldn't find readable text on that page");
    sendJson(res, 200, { title, finalUrl: fetched.url.href, format: "html", pages: [{ label: "Web page", text: text.slice(0, MAX_SOURCE_CHARS) }], totalPages: 1, truncated: text.length > MAX_SOURCE_CHARS, meta, crossref });
  } catch (error) {
    const message = error.name === "TimeoutError" ? "The site took too long to respond" : error.message || "Lattice couldn't read that link";
    sendJson(res, 502, { error: message });
  }
}

module.exports = { isPrivateHost, normalizeSourceUrl, decodeEntities, metaContent, metaAll, pageMeta, doiFromUrl, htmlToText, fetchSource };
