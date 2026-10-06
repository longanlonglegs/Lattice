const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateHost, normalizeSourceUrl, decodeEntities, metaContent, htmlToText } = require("../server/routes/fetch-source");

const href = value => normalizeSourceUrl(value).href;

test("normalizeSourceUrl turns DOIs into doi.org links", () => {
  assert.equal(href("10.1016/j.foodchem.2019.01.001"), "https://doi.org/10.1016/j.foodchem.2019.01.001");
  assert.equal(href("doi: 10.1016/j.foodchem.2019.01.001"), "https://doi.org/10.1016/j.foodchem.2019.01.001");
  assert.equal(href("DOI:10.1000/xyz123"), "https://doi.org/10.1000/xyz123");
  assert.equal(href("https://doi.org/10.1000/xyz123"), "https://doi.org/10.1000/xyz123");
  assert.equal(href("http://dx.doi.org/10.1000/xyz123"), "https://doi.org/10.1000/xyz123");
});

test("normalizeSourceUrl adds https:// to bare hosts and keeps http(s) links", () => {
  assert.equal(href("example.org/paper"), "https://example.org/paper");
  assert.equal(href("http://example.org/a?b=1"), "http://example.org/a?b=1");
});

test("normalizeSourceUrl sends arXiv PDF links to the abstract page", () => {
  assert.equal(href("https://arxiv.org/pdf/1706.03762"), "https://arxiv.org/abs/1706.03762");
  assert.equal(href("https://arxiv.org/pdf/1706.03762v7.pdf"), "https://arxiv.org/abs/1706.03762v7");
  assert.equal(href("https://www.arxiv.org/abs/1706.03762"), "https://arxiv.org/abs/1706.03762");
  assert.equal(href("arxiv.org/abs/hep-th/9901001"), "https://arxiv.org/abs/hep-th/9901001");
});

test("normalizeSourceUrl leaves other arXiv pages alone", () => {
  assert.equal(href("https://arxiv.org/list/cs.LG/recent"), "https://arxiv.org/list/cs.LG/recent");
});

test("normalizeSourceUrl rejects invalid links", () => {
  assert.throws(() => normalizeSourceUrl(""), /valid link or DOI/);
  assert.throws(() => normalizeSourceUrl("not a url at all"), /valid link or DOI/);
});

test("normalizeSourceUrl refuses private and local hosts", () => {
  for (const value of ["http://localhost:4173/", "127.0.0.1", "http://10.0.0.5/x", "192.168.1.1", "http://172.16.0.1", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "printer.local", "http://0.0.0.0/"]) {
    assert.throws(() => normalizeSourceUrl(value), /can't be fetched/, value);
  }
});

test("isPrivateHost flags loopback, private, link-local, and local names", () => {
  for (const host of ["localhost", "LOCALHOST", "app.localhost", "nas.local", "127.0.0.1", "127.8.8.8", "10.1.2.3", "192.168.0.10", "172.16.0.1", "172.31.255.255", "169.254.1.1", "0.0.0.0", "::1", "[::1]", "fc00::1", "fd12:3456::1"]) {
    assert.equal(isPrivateHost(host), true, host);
  }
});

test("isPrivateHost allows public hosts, including near-miss ranges", () => {
  for (const host of ["arxiv.org", "doi.org", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.0.1", "11.0.0.1", "localhost.example.com", "fe80.example"]) {
    assert.equal(isPrivateHost(host), false, host);
  }
});

test("decodeEntities handles named, decimal, and hex entities", () => {
  assert.equal(decodeEntities("Fish &amp; Chips &ndash; &#8220;fresh&#x201D; &nbsp;&unknown;"), "Fish & Chips – “fresh”  &unknown;"); // &nbsp; becomes a plain space so whitespace collapsing works
  assert.equal(decodeEntities("O&apos;Brien &AMP; co"), "O'Brien & co");
});

test("metaContent reads meta tags in either attribute order and quote style", () => {
  const html = `<meta content="Second order" name="citation_title"><meta property='og:title' content='Fallback'><meta name="citation_author" content="O&#39;Brien, Aoife">`;
  assert.equal(metaContent(html, ["citation_title"]), "Second order");
  assert.equal(metaContent(html, ["og:title"]), "Fallback");
  assert.equal(metaContent(html, ["citation_author"]), "O'Brien, Aoife");
});

test("metaContent returns the first name in priority order that has content", () => {
  const html = `<meta name="og:title" content="OG"><meta name="citation_title" content=""><meta name="dc.title" content="DC">`;
  assert.equal(metaContent(html, ["citation_title", "og:title", "dc.title"]), "OG");
  assert.equal(metaContent(html, ["missing"]), "");
});

test("htmlToText removes scripts, styles, navigation, and comments", () => {
  const html = `<html><head><style>p{color:red}</style><script>var secret = 1;</script></head><body>
    <nav>Home | About</nav><!-- hidden comment --><header>Site header</header>
    <p>First paragraph of the article.</p><p>Second &amp; last.</p><footer>Copyright</footer></body></html>`;
  const text = htmlToText(html);
  assert.equal(text, "First paragraph of the article.\nSecond & last.");
});

test("htmlToText prefers a long <article> or <main> over the rest of the page", () => {
  const body = "Real content sentence. ".repeat(50);
  const text = htmlToText(`<div>Sidebar links and promotions</div><article><p>${body}</p></article>`);
  assert.ok(!text.includes("Sidebar"));
  assert.ok(text.startsWith("Real content sentence."));
});

test("htmlToText ignores a short <article> and keeps the whole page", () => {
  const text = htmlToText(`<div>Main page text</div><article><p>Teaser</p></article>`);
  assert.equal(text, "Main page text\nTeaser");
});
