const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeForMatch, capPages, verifiedCards } = require("../server/routes/extract");
const { MAX_CARDS, MAX_SOURCE_CHARS } = require("../server/config");

const pages = [
  { label: "p. 1", text: "Introduction. Ascorbic acid degrades faster at higher temperatures in sealed bottles." },
  { label: "p. 2", text: "Results. Dissolved oxygen, not temperature, controlled the first 72 hours of vitamin C loss." }
];
const card = (fields = {}) => ({ claim: "Dissolved oxygen controlled early vitamin C loss.", quote: "Dissolved oxygen, not temperature, controlled the first 72 hours of vitamin C loss.", page: "p. 2", ...fields });

test("normalizeForMatch ignores case, punctuation, and whitespace", () => {
  assert.equal(normalizeForMatch("  Vitamin-C,  loss (72 h)! "), "vitamincloss72h");
  assert.equal(normalizeForMatch("line\nbreak\ttab"), "linebreaktab");
});

test("normalizeForMatch folds compatibility characters and keeps non-Latin letters", () => {
  assert.equal(normalizeForMatch("ﬁrst"), "first"); // ﬁ ligature, common in PDF text
  assert.equal(normalizeForMatch("Ｖｉｔａｍｉｎ"), "vitamin"); // full-width letters
  assert.equal(normalizeForMatch("Größe β-Carotin"), "größeβcarotin");
});

test("verifiedCards keeps a card whose quote is in the source", () => {
  const [result] = verifiedCards([card()], pages);
  assert.deepEqual(result, { claim: card().claim, short: "", quotes: [{ quote: card().quote, page: "p. 2" }] });
});

test("verifiedCards keeps up to 3 verified quotes per card, dropping invented and repeated ones", () => {
  const long = [{ label: "p. 1", text: "Copper was found in the rinse water. Copper speeds up vitamin C oxidation. Iron does the same at higher levels. Deionised water removed the effect entirely." }];
  const quotes = [
    { quote: "Copper was found in the rinse water.", page: "p. 1" },
    { quote: "A sentence the source never contained at all.", page: "p. 1" },
    { quote: "Copper was found in the rinse water.", page: "p. 1" },
    { quote: "Copper speeds up vitamin C oxidation.", page: "p. 1" },
    { quote: "Iron does the same at higher levels.", page: "p. 1" },
    { quote: "Deionised water removed the effect entirely.", page: "p. 1" }
  ];
  const [result] = verifiedCards([{ claim: "Copper and iron speed up vitamin C oxidation.", quotes }], long);
  assert.deepEqual(result.quotes.map(quote => quote.quote), ["Copper was found in the rinse water.", "Copper speeds up vitamin C oxidation.", "Iron does the same at higher levels."]);
  assert.deepEqual(verifiedCards([{ claim: "A claim.", quotes: [{ quote: "A sentence the source never contained at all.", page: "p. 1" }] }], long), []);
  assert.deepEqual(verifiedCards([{ claim: "A claim.", quotes: [] }], long), []);
});

test("verifiedCards accepts quotes that differ only in case, spacing, or punctuation", () => {
  const quote = "dissolved   oxygen not temperature — controlled the first 72 hours of vitamin c loss";
  const result = verifiedCards([card({ quote })], pages);
  assert.equal(result.length, 1);
  assert.equal(result[0].quotes[0].quote, quote.replace(/\s+/g, " "));
});

test("verifiedCards drops paraphrased or invented quotes", () => {
  assert.deepEqual(verifiedCards([card({ quote: "Oxygen was the main driver of vitamin C loss in the first three days." })], pages), []);
  assert.deepEqual(verifiedCards([card({ quote: "Dissolved oxygen, not temperature, controlled the first 96 hours of vitamin C loss." })], pages), []);
});

test("verifiedCards does not accept a quote stitched together from two pages", () => {
  const quote = "in sealed bottles. Results. Dissolved oxygen, not temperature";
  assert.deepEqual(verifiedCards([card({ quote })], pages), []);
});

test("verifiedCards accepts a quote that skips text with an ellipsis, in order", () => {
  const long = [{ label: "p. 1", text: "Copper was found in the rinse water. The bottles were relabelled afterwards. Copper speeds up vitamin C oxidation." }];
  assert.equal(verifiedCards([card({ quote: "Copper was found in the rinse water. … Copper speeds up vitamin C oxidation.", page: "p. 1" })], long).length, 1);
  assert.equal(verifiedCards([card({ quote: "Copper was found in the rinse water... Copper speeds up vitamin C oxidation.", page: "p. 1" })], long).length, 1);
  assert.equal(verifiedCards([card({ quote: "Copper speeds up vitamin C oxidation. … Copper was found in the rinse water.", page: "p. 1" })], long).length, 0);
});

test("verifiedCards accepts skipped sentences and marks the gap with an ellipsis", () => {
  const long = [{ label: "p. 1", text: "Copper was found in the rinse water. The bottles were relabelled afterwards. Copper speeds up vitamin C oxidation." }];
  const [result] = verifiedCards([card({ quote: "Copper was found in the rinse water. Copper speeds up vitamin C oxidation.", page: "p. 1" })], long);
  assert.equal(result.quotes[0].quote, "Copper was found in the rinse water. … Copper speeds up vitamin C oxidation.");
  const [adjacent] = verifiedCards([card({ quote: "The bottles were relabelled afterwards. Copper speeds up vitamin C oxidation.", page: "p. 1" })], long);
  assert.equal(adjacent.quotes[0].quote, "The bottles were relabelled afterwards. Copper speeds up vitamin C oxidation.");
});

test("verifiedCards keeps abbreviations such as Fig. inside one piece", () => {
  const text = [{ label: "p. 4", text: "As shown in Fig. 2 the loss slows sharply after the first day of storage." }];
  assert.equal(verifiedCards([card({ quote: "As shown in Fig. 2 the loss slows sharply after the first day of storage.", page: "p. 4" })], text).length, 1);
});

test("verifiedCards drops quotes that are too short to be meaningful", () => {
  assert.deepEqual(verifiedCards([card({ quote: "Dissolved oxygen" })], pages), []);
});

test("verifiedCards drops cards with an empty claim", () => {
  assert.deepEqual(verifiedCards([card({ claim: "  " })], pages), []);
  assert.deepEqual(verifiedCards([card({ claim: undefined })], pages), []);
});

test("verifiedCards corrects a wrong page label to the page the quote is on", () => {
  const [result] = verifiedCards([card({ page: "p. 1" })], pages);
  assert.equal(result.quotes[0].page, "p. 2");
  const [unknown] = verifiedCards([card({ page: "p. 99" })], pages);
  assert.equal(unknown.quotes[0].page, "p. 2");
});

test("verifiedCards prefers the claimed page when the quote appears on several", () => {
  const repeated = [{ label: "p. 1", text: "The same sentence appears on both of these pages." }, { label: "p. 2", text: "The same sentence appears on both of these pages." }];
  const [result] = verifiedCards([card({ quote: "The same sentence appears on both of these pages.", page: "p. 2" })], repeated);
  assert.equal(result.quotes[0].page, "p. 2");
});

test("verifiedCards trims the claim and returns only claim, short, and quotes", () => {
  const [result] = verifiedCards([card({ claim: "  A claim.  ", extra: "dropped" })], pages);
  assert.deepEqual(Object.keys(result), ["claim", "short", "quotes"]);
  assert.equal(result.claim, "A claim.");
});

test("verifiedCards returns at most MAX_CARDS cards and tolerates a missing list", () => {
  assert.equal(verifiedCards(Array.from({ length: MAX_CARDS + 4 }, () => card()), pages).length, MAX_CARDS);
  assert.deepEqual(verifiedCards(undefined, pages), []);
});

test("capPages collapses whitespace (keeping single line breaks) and skips pages without a label or text", () => {
  const result = capPages([{ label: "p. 1", text: "  a \n\n b \t c  " }, { label: "", text: "no label" }, { label: "p. 3", text: "   " }, null]);
  assert.deepEqual(result, { pages: [{ label: "p. 1", text: "a\nb c" }], truncated: false });
});

test("capPages limits labels to 80 characters", () => {
  const [page] = capPages([{ label: "x".repeat(200), text: "text" }]).pages;
  assert.equal(page.label.length, 80);
});

test("capPages cuts text at MAX_SOURCE_CHARS and reports truncation", () => {
  const half = "a".repeat(MAX_SOURCE_CHARS / 2);
  const result = capPages([{ label: "p. 1", text: half }, { label: "p. 2", text: half + "bbb" }, { label: "p. 3", text: "never read" }]);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.pages.map(page => page.label), ["p. 1", "p. 2"]);
  assert.equal(result.pages.reduce((total, page) => total + page.text.length, 0), MAX_SOURCE_CHARS);
});

test("capPages does not report truncation when the text fits exactly", () => {
  const result = capPages([{ label: "p. 1", text: "a".repeat(MAX_SOURCE_CHARS) }, { label: "p. 2", text: "   " }]);
  assert.equal(result.truncated, false);
  assert.equal(result.pages.length, 1);
});

test("capPages reports truncation when more text follows a full budget", () => {
  const result = capPages([{ label: "p. 1", text: "a".repeat(MAX_SOURCE_CHARS) }, { label: "p. 2", text: "more" }]);
  assert.equal(result.truncated, true);
});
