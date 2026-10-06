// Source metadata (Part 4B): browser helpers, page meta tags, Crossref, and the extraction fallback.
const test = require("node:test");
const assert = require("node:assert/strict");
const { metaAll, pageMeta, doiFromUrl } = require("../server/routes/fetch-source");
const { crossrefToMeta, lookupDoiRoute } = require("../server/routes/lookup-doi");
const { extractCards } = require("../server/routes/extract");
const { callRoute, stubOpenAI } = require("./helpers");

const load = () => import("../src/records.js");

test("cleanMeta normalises names, years, and DOIs and drops empty fields", async () => {
  const { cleanMeta } = await load();
  assert.deepEqual(cleanMeta({ title: "  A  title ", authors: ["Vaswani, Ashish", "Noam Shazeer"], date: "2017/06/12", venue: "", doi: "https://doi.org/10.1000/xyz" }),
    { title: "A title", authors: ["Ashish Vaswani", "Noam Shazeer"], year: "2017", doi: "10.1000/xyz" });
  assert.deepEqual(cleanMeta({ authors: "Chidinma Okafor and Erik Lindqvist" }).authors, ["Chidinma Okafor", "Erik Lindqvist"]);
  assert.deepEqual(cleanMeta({ authors: "Okafor, C.; Lindqvist, E." }).authors, ["C. Okafor", "E. Lindqvist"]);
  assert.deepEqual(cleanMeta(null), {});
});

test("pdfInfoMeta reads Title/Author/CreationDate and ignores placeholder titles", async () => {
  const { pdfInfoMeta } = await load();
  assert.deepEqual(pdfInfoMeta({ title: "Oxygen and vitamin C", author: "Leila Haddad", date: "D:20210314120000Z" }), { title: "Oxygen and vitamin C", authors: ["Leila Haddad"], year: "2021" });
  assert.deepEqual(pdfInfoMeta({ title: "Microsoft Word - draft.docx", author: "", date: "" }), {});
});

test("mergeMeta keeps earlier layers and fills gaps from later ones", async () => {
  const { mergeMeta } = await load();
  assert.deepEqual(mergeMeta({ title: "From tags", authors: [] }, { title: "From PDF", authors: ["A B"], year: "2019" }, { venue: "Journal", year: "2001" }),
    { title: "From tags", authors: ["A B"], year: "2019", venue: "Journal" });
});

test("shortCitation, citationLine and reference format a source", async () => {
  const { shortCitation, citationLine, reference } = await load();
  const meta = { title: "Arrhenius behaviour", authors: ["Chidinma Okafor", "Erik Lindqvist"], year: "2019", venue: "Demo Journal of Food Chemistry", doi: "10.1000/demo" };
  assert.equal(shortCitation(meta), "Okafor & Lindqvist 2019");
  assert.equal(shortCitation({ authors: ["Maria Ivanova"], year: "2018" }), "Ivanova 2018");
  assert.equal(shortCitation({ authors: ["A One", "B Two", "C Three"] }), "One et al.");
  assert.equal(shortCitation({}), "");
  assert.equal(citationLine(meta), "Chidinma Okafor, Erik Lindqvist (2019) · Demo Journal of Food Chemistry");
  assert.equal(reference(meta), "Chidinma Okafor, Erik Lindqvist (2019). Arrhenius behaviour. Demo Journal of Food Chemistry. https://doi.org/10.1000/demo");
  assert.equal(reference({}, "notes.txt"), "notes.txt");
});

test("pageMeta reads citation_* tags, all authors, and marks arXiv", () => {
  const html = `<meta name="citation_title" content="Attention Is All You Need"><meta name="citation_author" content="Vaswani, Ashish"><meta content="Shazeer, Noam" name="citation_author"><meta name="citation_date" content="2017/06/12"><meta name="citation_arxiv_id" content="1706.03762">`;
  assert.deepEqual(metaAll(html, "citation_author"), ["Vaswani, Ashish", "Shazeer, Noam"]);
  assert.deepEqual(pageMeta(html, new URL("https://arxiv.org/abs/1706.03762")), { title: "Attention Is All You Need", authors: ["Vaswani, Ashish", "Shazeer, Noam"], date: "2017/06/12", venue: "arXiv", doi: "" });
  const journal = pageMeta(`<meta name="citation_journal_title" content="Food Chemistry"><meta name="citation_doi" content="doi:10.1016/j.foodchem.2019.01.001">`, new URL("https://example.org/a"));
  assert.equal(journal.venue, "Food Chemistry");
  assert.equal(journal.doi, "10.1016/j.foodchem.2019.01.001");
});

test("doiFromUrl only reads doi.org links", () => {
  assert.equal(doiFromUrl(new URL("https://doi.org/10.1000/xyz123")), "10.1000/xyz123");
  assert.equal(doiFromUrl(new URL("https://example.org/10.1000/xyz123")), "");
});

test("crossrefToMeta maps a Crossref work", () => {
  const work = { title: ["Ascorbic acid <i>in situ</i>"], author: [{ given: "Leila", family: "Haddad" }, { name: "Food Group" }], issued: { "date-parts": [[2021, 3]] }, "container-title": ["Food Chemistry"], DOI: "10.1000/x", URL: "https://doi.org/10.1000/x" };
  assert.deepEqual(crossrefToMeta(work), { title: "Ascorbic acid in situ", authors: ["Leila Haddad", "Food Group"], year: "2021", venue: "Food Chemistry", doi: "10.1000/x", url: "https://doi.org/10.1000/x" });
});

test("lookup-doi rejects non-DOIs and sends only the DOI to Crossref", async t => {
  const realFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    if (url.endsWith("10.1000%2Fmissing")) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => ({ message: { title: ["T"], author: [{ given: "A", family: "B" }], issued: { "date-parts": [[2020]] }, "container-title": ["J"], DOI: "10.1000/x" } }) };
  };
  t.after(() => { globalThis.fetch = realFetch; });
  assert.equal((await callRoute(lookupDoiRoute, { doi: "not a doi" })).status, 400);
  const found = await callRoute(lookupDoiRoute, { doi: "https://doi.org/10.1000/x" });
  assert.equal(found.status, 200);
  assert.equal(found.body.meta.venue, "J");
  assert.equal(urls[0], "https://api.crossref.org/works/10.1000%2Fx");
  assert.equal((await callRoute(lookupDoiRoute, { doi: "10.1000/missing" })).status, 404);
});

test("extract-cards returns the printed source details, cleaned", async t => {
  const passage = "Ascorbic acid in orange juice is lost faster when the headspace contains more oxygen than usual.";
  stubOpenAI(t, () => ({ source_info: { title: " Oxygen paper ", authors: ["Leila Haddad", ""], year: "2021", venue: "", doi: "" }, cards: [{ claim: "Oxygen speeds loss.", quote: passage, page: "p. 1" }] }));
  const { body } = await callRoute(extractCards, { mode: "content", title: "S2.pdf", pages: [{ label: "p. 1", text: passage }] });
  assert.deepEqual(body.source_info, { title: "Oxygen paper", authors: ["Leila Haddad"], year: "2021", venue: "", doi: "" });
});
