// Adding evidence: links, files, pasted text, and browser captures, then card extraction.
import { $, toast, plural } from "./util.js";
import { nextCardId, card, currentProject, persist, saveWorkspace, recordActivity } from "./state.js";
import { renderProject } from "./workspace.js";
import { closeDrawer } from "./project-shell.js";
import { mergeMeta, pdfInfoMeta } from "./records.js";
import { putText } from "./db.js";
import { enqueueImport, throwIfCancelled } from "./imports.js";
import { extractionMode, originOf, pickableOrigins } from "./origins.js";

export const maxAiChars = 60000;

// Basic (rule-based) extraction, used only when AI extraction is unavailable.
export function claimsFromText(text, source, page = "") {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g)?.filter(sentence => sentence.trim().length > 55).slice(0, 3) || [];
  return sentences.map(sentence => card(nextCardId(), sentence.trim(), [{ text: sentence.trim(), location: `${page || "Source"} · ${source.title}` }], source.id, source.origin));
}
export function capPages(pages) {
  const capped = [];
  let total = 0;
  for (const { label, text } of pages) {
    if (total >= maxAiChars) return { pages: capped, truncated: true };
    // Line breaks are kept: they separate a paper's title, author, and journal lines.
    const clean = String(text).replace(/[^\S\n]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    if (clean) capped.push({ label, text: clean.slice(0, maxAiChars - total) });
    total += clean.length;
  }
  return { pages: capped, truncated: total > maxAiChars };
}
export async function extractCards(project, source, pages, mode, signal) {
  const capped = capPages(pages);
  try {
    const response = await fetch("/api/extract-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, title: source.title, url: source.originalUrl || "", question: project.question, hypothesis: project.hypothesis, pages: capped.pages, truncated: capped.truncated }), signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "AI extraction is unavailable");
    if (!payload.cards?.length) throw new Error("AI found no passages it could anchor");
    return { method: "ai", truncated: payload.truncated, info: payload.source_info, cards: payload.cards.map(item => ({ ...card(nextCardId(), item.claim, item.quotes.map(quote => ({ text: quote.quote, location: `${quote.page} · ${source.title}` })), source.id, source.origin), ...(item.short ? { short: item.short } : {}) })) };
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled: don't fall back to basic extraction
    return { method: "basic", reason: error.message, cards: pages.flatMap(({ label, text }) => claimsFromText(text, source, label)).slice(0, 6) };
  }
}
// Adds a source and its extracted cards to a project. Cards accumulate; nothing is replaced.
export async function ingestSource(project, source, pages, { mode = "content", activity, signal }) {
  const result = await extractCards(project, source, pages, mode, signal);
  throwIfCancelled(signal); // nothing is added once an import is cancelled
  source.extraction = result.method;
  source.addedAt = new Date().toISOString();
  // Own work gets no metadata. For external sources, details printed in the text only fill gaps.
  if (source.origin === "external") source.meta = mergeMeta(source.meta, result.info);
  source.detail = `${source.detail} · ${result.method === "ai" ? "AI extraction" : "basic extraction"}`;
  project.sources.push(source);
  project.cards.push(...result.cards);
  // The full text is kept so edited quotes can be checked against it later.
  putText(source.id, pages).catch(error => console.error("Could not store source text", error));
  recordActivity(activity[0], activity[1], activity[2], project);
  project.aiAnalysis = null;
  project.placeholder = false;
  project.updatedAt = new Date().toISOString();
  if (project === currentProject()) { saveWorkspace(); renderProject(); } else persist();
  return result;
}
export function announce(result, source, truncated = false) {
  const count = plural(result.cards.length, "card");
  if (!result.cards.length) toast(`${source.title} was saved, but no usable passages were found.`);
  else if (result.method === "ai") toast(`${count} added from ${source.title}.${result.truncated || truncated ? " Only the first ~60k characters were read." : ""}`);
  else toast(`Used basic extraction (${result.reason}). ${count} added.`);
}
export async function readPdf(file, signal) {
  const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      throwIfCancelled(signal);
      const page = await pdf.getPage(pageNo);
      const text = (await page.getTextContent()).items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
      if (text) pages.push({ pageNo, text });
    }
    const info = (await pdf.getMetadata().catch(() => null))?.info || {};
    return { pages, info: { title: info.Title, author: info.Author, date: info.CreationDate } };
  } finally {
    await pdf.destroy();
  }
}

// Queues the extraction of already-read pages into a project (used by every way of adding evidence).
export function queueSource(project, source, pages, options) {
  enqueueImport({
    title: source.title,
    projectTitle: project.title,
    run: async (signal, setNote) => {
      setNote("Extracting cards…");
      const result = await ingestSource(project, source, pages, { ...options, signal });
      announce(result, source, options.truncated);
      return result.cards.length ? `${plural(result.cards.length, "card")}${result.method === "ai" ? "" : " (basic extraction)"}` : "No usable passages";
    }
  });
}

export function addLocalFile(file) {
  if (!file) return toast("Choose a PDF, Markdown, or text file first.");
  const project = currentProject();
  const origin = $("#evidence-origin").value;
  const ownWork = origin !== "external";
  const where = ownWork ? originOf(origin).label.toLowerCase() : "imported locally";
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const source = { id: crypto.randomUUID(), title: file.name, kind: ownWork ? "work" : isPdf ? "pdf" : "text", origin, detail: `${Math.max(1, Math.round(file.size / 1024))} KB · ${where}` };
  const activity = ["import", ownWork ? `Added ${where}: ${source.title}` : `Imported ${source.title}`];
  enqueueImport({
    title: file.name,
    projectTitle: project.title,
    run: async (signal, setNote) => {
      let pages;
      try {
        if (isPdf) {
          setNote("Reading PDF…");
          const { pages: pdfPages, info } = await readPdf(file, signal);
          if (!ownWork) source.meta = pdfInfoMeta(info);
          pages = pdfPages.map(({ pageNo, text }) => ({ label: `p. ${pageNo}`, text }));
          source.detail = `${plural(pdfPages.length, "page")} · ${where}`;
        } else {
          const text = await file.text();
          source.capturedText = text;
          pages = [{ label: ownWork ? "Your text" : "Imported text", text }];
        }
      } catch (error) {
        if (signal.aborted) throw error;
        toast(`Lattice could not read ${file.name}. Try a text-based PDF or Markdown file.`);
        throw new Error("Couldn't read this file");
      }
      if (!pages.length) throw new Error("No selectable text (scanned PDFs aren't supported)");
      setNote("Extracting cards…");
      const result = await ingestSource(project, source, pages, { mode: extractionMode(origin), activity: [...activity, source.detail], signal });
      announce(result, source);
      return result.cards.length ? plural(result.cards.length, "card") : "No usable passages";
    }
  });
  $("#file-input").value = "";
  closeDrawer();
}

export function addPastedText() {
  const text = $("#source-text").value.trim();
  if (!text) return toast("Paste text first.");
  const origin = $("#evidence-origin").value;
  const ownWork = origin !== "external";
  const label = originOf(origin).label;
  const source = { id: crypto.randomUUID(), title: ownWork ? `${label} notes` : "Pasted text", kind: ownWork ? "work" : "text", origin, detail: ownWork ? `${label} · pasted text` : "Imported locally", capturedText: text };
  queueSource(currentProject(), source, [{ label: ownWork ? "Your text" : "Pasted text", text }], { mode: extractionMode(origin), activity: ["import", ownWork ? `Added ${label.toLowerCase()} notes` : "Added pasted text", "Imported locally"] });
  $("#source-text").value = "";
  closeDrawer();
}

export function addUrlSource() {
  const value = $("#source-input").value.trim();
  if (!value) return toast("Add a URL or DOI first.");
  const project = currentProject();
  enqueueImport({
    title: value.replace(/^https?:\/\//, ""),
    projectTitle: project.title,
    run: async (signal, setNote) => {
      setNote("Reading link…");
      let fetched;
      try {
        const response = await fetch("/api/fetch-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }), signal });
        fetched = await response.json().catch(() => ({}));
        if (!response.ok || !fetched.pages?.length) throw new Error(fetched.error || "Lattice couldn't read that link");
      } catch (error) {
        if (signal.aborted) throw error;
        // Unreadable links are still kept as a reference.
        const source = { id: crypto.randomUUID(), title: value.replace(/^https?:\/\//, ""), kind: "url", origin: "external", detail: "Link saved locally · not read", originalUrl: value };
        project.sources.push(source);
        recordActivity("import", "Saved a source link", source.title, project);
        if (project === currentProject()) { saveWorkspace(); renderProject(); } else persist();
        toast(`${error.message}. The link was saved, but no cards were created.`);
        return "Link saved, but it couldn't be read";
      }
      let host = "";
      try { host = new URL(fetched.finalUrl).hostname.replace(/^www\./, ""); } catch { host = "link"; }
      const extent = fetched.format === "pdf" ? plural(fetched.totalPages, "page") : "web page";
      const source = { id: crypto.randomUUID(), title: fetched.title || value.replace(/^https?:\/\//, ""), kind: "url", origin: "external", detail: `${host} · ${extent}`, originalUrl: value, fetched: true, meta: mergeMeta({ url: fetched.finalUrl }, fetched.meta, pdfInfoMeta(fetched.pdfInfo), fetched.crossref) };
      setNote("Extracting cards…");
      const result = await ingestSource(project, source, fetched.pages, { mode: "link", activity: ["import", `Read ${source.title}`, host], signal });
      announce(result, source, fetched.truncated);
      return result.cards.length ? plural(result.cards.length, "card") : "No usable passages";
    }
  });
  $("#source-input").value = "";
  closeDrawer();
}

export function receiveBrowserCapture(payload) {
  const selection = String(payload?.selection || "").trim();
  const url = String(payload?.url || "").trim();
  if (!selection || !url) return;
  const title = String(payload?.title || new URL(url).hostname).trim();
  // The extension lets the user say where the passage comes from; anything unknown counts as an external source.
  const origin = pickableOrigins.includes(payload?.origin) ? payload.origin : "external";
  const source = { id: crypto.randomUUID(), title, kind: "web", origin, detail: url, originalUrl: url, capturedText: selection };
  toast("Web passage captured. Extracting cards…");
  queueSource(currentProject(), source, [{ label: "Web capture", text: selection }], { mode: extractionMode(origin), activity: ["capture", `Captured ${origin === "external" ? "a passage" : originOf(origin).label.toLowerCase()} from ${title}`, url] });
}
