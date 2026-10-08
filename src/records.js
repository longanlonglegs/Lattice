// Pure data helpers: card/source migration, workspace <-> store records, and quote checks.
// No DOM or storage access, so node:test can import this module.

// Old flashcards { tag, question, answer, page, stance, revealed } and single-quote cards { quote, location }
// become evidence cards { claim, quotes: [{ text, location }], origin, note }. Safe to run on migrated cards.
export function migrateCard(card, source) {
  const { tag, question, answer, page, stance, revealed, quote, location, quoteMissing, ...rest } = card;
  const quotes = Array.isArray(card.quotes) ? card.quotes : [{ text: String(quote || ""), location: typeof location === "string" ? location : String(page || ""), ...(quoteMissing ? { missing: true } : {}) }];
  return {
    ...rest,
    claim: typeof card.claim === "string" && card.claim ? card.claim : String(answer || question || quote || ""),
    quotes,
    // "My draft" was retired: draft cards are the researcher's own work, so they become experiments.
    origin: ((card.origin || source?.origin || "external") === "draft" ? "experiment" : card.origin || source?.origin || "external"),
    state: card.state || "pending",
    note: typeof card.note === "string" ? card.note : ""
  };
}

export function migrateSource(source) {
  if (source.origin === "draft") return { ...source, origin: "experiment" }; // "My draft" was retired
  return source.origin ? source : { ...source, origin: source.kind === "work" ? "experiment" : "external" };
}

// Splits the in-memory workspace into one record list per object store.
export function splitWorkspace(workspace) {
  const projects = [], sources = [], cards = [];
  for (const project of workspace.projects) {
    const { cards: projectCards, sources: projectSources, ...fields } = project;
    projects.push({ ...fields, order: projects.length });
    (projectSources || []).forEach((source, order) => sources.push({ ...source, projectId: project.id, order }));
    (projectCards || []).forEach((card, order) => cards.push({ ...card, projectId: project.id, order }));
  }
  return { projects, sources, cards, meta: [{ key: "workspace", activeId: workspace.activeId }] };
}

// The reverse of splitWorkspace.
export function joinWorkspace({ projects = [], sources = [], cards = [], meta = [] }) {
  const byOrder = (a, b) => a.order - b.order;
  const strip = ({ projectId, order, ...fields }) => fields;
  const ofProject = (list, id) => list.filter(item => item.projectId === id).sort(byOrder).map(strip);
  return {
    activeId: meta.find(item => item.key === "workspace")?.activeId || projects[0]?.id,
    projects: projects.slice().sort(byOrder).map(project => ({ ...strip(project), sources: ofProject(sources, project.id), cards: ofProject(cards, project.id) }))
  };
}

// Where a card's first quote is from ("p. 2 · Okafor 2019.pdf").
export const cardLocation = card => card.quotes?.[0]?.location || "";

// Same normalisation the server uses to verify quotes.
export function normalizeForMatch(text) {
  return String(text).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// True when the quote appears word-for-word (ignoring case, spacing, punctuation) on one page.
// Checked sentence by sentence (and across "…"), in order, like the server does at extraction.
export function quoteInPages(quote, pages) {
  const pieces = String(quote).split(/\s*(?:…|\.\.\.)\s*|(?<=[.!?])\s+/).map(normalizeForMatch).filter(Boolean);
  return pieces.length > 0 && pages.some(page => {
    const text = normalizeForMatch(page.text);
    let from = 0;
    return pieces.every(piece => { const at = text.indexOf(piece, from); from = at + piece.length; return at >= 0; });
  });
}

// Brings a loaded or restored workspace up to the current card/source shape (mutates it).
export function migrateWorkspace(workspace) {
  for (const project of workspace.projects || []) {
    project.sources = (project.sources || []).map(migrateSource);
    const sourceById = new Map(project.sources.map(source => [source.id, source]));
    project.cards = (project.cards || []).map(card => migrateCard(card, sourceById.get(card.sourceId)));
  }
  return workspace;
}

// ---------- Source metadata (Part 4B) ----------
// source.meta = { title, authors[], year, venue, doi, url }, every field optional.

const text = value => String(value ?? "").replace(/\s+/g, " ").trim();

// "Vaswani, Ashish" -> "Ashish Vaswani"; other names are kept as written.
export function displayName(name) {
  const clean = text(name);
  const parts = clean.split(",").map(text);
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : clean;
}

// Authors may come as an array or as one string ("A; B", "A, B and C").
export function splitAuthors(value) {
  const list = Array.isArray(value) ? value : text(value).split(text(value).includes(";") ? /\s*;\s*/ : /\s*,\s*|\s+and\s+|\s*&\s*/);
  return list.map(displayName).filter(Boolean);
}

export function yearOf(value) {
  // PDF dates look like "D:20210314120000Z".
  return text(value).replace(/^D:(\d{4}).*/, "$1").match(/(?:^|\D)((?:1[89]|20)\d{2})(?!\d)/)?.[1] || "";
}

// Accepts loosely shaped input (a date instead of a year, authors as a string) and returns a clean meta object.
export function cleanMeta(input) {
  if (!input || typeof input !== "object") return {};
  const meta = {
    title: text(input.title),
    authors: splitAuthors(input.authors ?? input.author ?? []),
    year: yearOf(input.year || input.date),
    venue: text(input.venue),
    doi: text(input.doi).replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, ""),
    url: text(input.url)
  };
  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value.length));
}

// PDF document info (Title / Author / CreationDate). Placeholder titles are ignored.
export function pdfInfoMeta(info) {
  if (!info) return {};
  const title = text(info.title ?? info.Title);
  return cleanMeta({ title: /^(untitled|microsoft word|document\d*$)/i.test(title) ? "" : title, authors: info.author ?? info.Author ?? "", date: info.date ?? info.CreationDate ?? "" });
}

// Earlier layers win; later layers only fill fields that are still empty.
export function mergeMeta(...layers) {
  const merged = {};
  for (const layer of layers.map(cleanMeta)) {
    for (const [key, value] of Object.entries(layer)) if (!merged[key]) merged[key] = value;
  }
  return merged;
}

export const surname = name => text(name).split(" ").pop();

// "Okafor 2019", "Okafor & Lindqvist 2019", "Okafor et al. 2019"
export function shortCitation(meta) {
  const authors = meta?.authors || [];
  if (!authors.length) return "";
  const names = authors.length === 1 ? surname(authors[0]) : authors.length === 2 ? `${surname(authors[0])} & ${surname(authors[1])}` : `${surname(authors[0])} et al.`;
  return [names, meta.year].filter(Boolean).join(" ");
}

// "Chidinma Okafor, Erik Lindqvist (2019) · Demo Journal of Food Chemistry"
export function citationLine(meta) {
  const authors = meta?.authors || [];
  const who = authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ");
  const head = [who, meta?.year ? `(${meta.year})` : ""].filter(Boolean).join(" ");
  return [head, meta?.venue].filter(Boolean).join(" · ");
}

// A simple reference for Markdown export: "Authors (year). Title. Venue. https://doi.org/…"
export function reference(meta, fallbackTitle = "") {
  const authors = meta?.authors || [];
  const who = authors.length > 6 ? `${authors.slice(0, 6).join(", ")}, et al.` : authors.join(", ");
  const link = meta?.doi ? `https://doi.org/${meta.doi}` : meta?.url || "";
  return [[who, meta?.year ? `(${meta.year})` : ""].filter(Boolean).join(" "), meta?.title || fallbackTitle, meta?.venue, link]
    .filter(Boolean).map(part => part.replace(/\.$/, "")).join(". ");
}

// ---------- Question & hypothesis versions (Part 5) ----------

// Word-level diff of two texts: [{ type: "same" | "add" | "del", text }], adjacent words of one type merged.
export function wordDiff(before, after) {
  const a = String(before || "").split(/\s+/).filter(Boolean);
  const b = String(after || "").split(/\s+/).filter(Boolean);
  // Longest common subsequence table, filled from the end.
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const parts = [];
  const push = (type, word) => { const last = parts.at(-1); if (last?.type === type) last.text += ` ${word}`; else parts.push({ type, text: word }); };
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push("same", a[i]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return parts;
}

// Without AI, each sentence of the hypothesis becomes one guess (at most 5).
export function sentenceGuesses(hypothesis) {
  const text = String(hypothesis || "").replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(sentence => sentence.trim()).filter(Boolean) || [];
  return sentences.slice(0, 5).map(sentence => ({ guess: sentence, quote: sentence }));
}

// ---------- Single-project export / import (Part 10) ----------

// A project file: { app: "Lattice", kind: "project", version: 1, project, texts, embeddings, edges }.
// Importing always makes a copy with fresh ids, so it can't clash with anything already in this browser.
// ids: { projectId, sourceId(), cardId() } supplies the new ids. Returns { project, texts, embeddings, edges }.
export function remapProjectBundle(bundle, ids) {
  const original = bundle.project;
  const sourceIds = new Map((original.sources || []).map(source => [source.id, ids.sourceId()]));
  const cardIds = new Map((original.cards || []).map(card => [card.id, ids.cardId()]));
  const project = {
    ...original,
    id: ids.projectId,
    sources: (original.sources || []).map(source => ({ ...source, id: sourceIds.get(source.id) })),
    cards: (original.cards || []).map(card => ({ ...card, id: cardIds.get(card.id), sourceId: sourceIds.get(card.sourceId) ?? card.sourceId, editing: false })),
    versions: (original.versions || []).map(version => ({ ...version, linkedCardIds: (version.linkedCardIds || []).map(id => cardIds.get(id)).filter(id => id != null) })),
    webLayout: Object.fromEntries(Object.entries(original.webLayout || {}).filter(([id]) => cardIds.has(Number(id))).map(([id, position]) => [cardIds.get(Number(id)), position])),
    aiAnalysis: null // its evidence ids belong to the old cards
  };
  const texts = (bundle.texts || []).filter(text => sourceIds.has(text.sourceId)).map(text => ({ ...text, sourceId: sourceIds.get(text.sourceId) }));
  const embeddings = (bundle.embeddings || []).filter(record => cardIds.has(record.cardId)).map(record => {
    const cardId = cardIds.get(record.cardId);
    return { ...record, id: `${project.id}:${cardId}`, projectId: project.id, cardId };
  });
  const flip = { a_to_b: "b_to_a", b_to_a: "a_to_b" };
  const edges = (bundle.edges || []).filter(edge => cardIds.has(edge.a) && cardIds.has(edge.b)).map(edge => {
    const a = cardIds.get(edge.a), b = cardIds.get(edge.b);
    const swap = a > b; // an edge's `a` is always the lower card id
    return { ...edge, id: `${Math.min(a, b)}|${Math.max(a, b)}`, projectId: project.id, a: swap ? b : a, b: swap ? a : b, aText: swap ? edge.bText : edge.aText, bText: swap ? edge.aText : edge.bText, direction: swap ? flip[edge.direction] || edge.direction : edge.direction };
  });
  return { project, texts, embeddings, edges };
}

export function isProjectBundle(bundle) {
  return bundle?.app === "Lattice" && bundle.kind === "project" && typeof bundle.project?.title === "string" && Array.isArray(bundle.project.cards) && Array.isArray(bundle.project.sources);
}
