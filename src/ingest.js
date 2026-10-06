// Adding evidence: links, files, pasted text, and browser captures, then card extraction.
import { $, toast, plural } from "./util.js";
import { nextCardId, card, currentProject, persist, saveWorkspace, recordActivity } from "./state.js";
import { renderProject } from "./workspace.js";
import { closeDrawer } from "./project-shell.js";
import { mergeMeta, pdfInfoMeta } from "./records.js";
import { putText } from "./db.js";
import { extractionMode, originOf } from "./origins.js";

export const maxAiChars = 60000;

// Basic (rule-based) extraction, used only when AI extraction is unavailable.
export function claimsFromText(text, source, page = "") {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g)?.filter(sentence => sentence.trim().length > 55).slice(0, 3) || [];
  return sentences.map(sentence => card(nextCardId(), sentence.trim(), sentence.trim(), `${page || "Source"} · ${source.title}`, source.id, source.origin));
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
export async function extractCards(project, source, pages, mode) {
  const capped = capPages(pages);
  try {
    const response = await fetch("/api/extract-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, title: source.title, url: source.originalUrl || "", question: project.question, hypothesis: project.hypothesis, pages: capped.pages, truncated: capped.truncated }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "AI extraction is unavailable");
    if (!payload.cards?.length) throw new Error("AI found no passages it could anchor");
    return { method: "ai", truncated: payload.truncated, info: payload.source_info, cards: payload.cards.map(item => card(nextCardId(), item.claim || item.answer || item.quote, item.quote, `${item.page} · ${source.title}`, source.id, source.origin)) };
  } catch (error) {
    return { method: "basic", reason: error.message, cards: pages.flatMap(({ label, text }) => claimsFromText(text, source, label)).slice(0, 6) };
  }
}
// Adds a source and its extracted cards to a project. Cards accumulate; nothing is replaced.
export async function ingestSource(project, source, pages, { mode = "content", activity }) {
  const result = await extractCards(project, source, pages, mode);
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
export async function ingestAndShow(project, source, pages, options) {
  const result = await ingestSource(project, source, pages, options);
  if (project === currentProject()) closeDrawer();
  announce(result, source, options.truncated);
}
export function setBusy(button, label) {
  if (!button.disabled) button.dataset.idleLabel = button.innerHTML;
  button.disabled = true; button.textContent = label;
}
export function clearBusy(button) {
  button.disabled = false; button.innerHTML = button.dataset.idleLabel || button.innerHTML;
}
export async function readPdf(file) {
  const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const text = (await page.getTextContent()).items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
    if (text) pages.push({ pageNo, text });
  }
  const info = (await pdf.getMetadata().catch(() => null))?.info || {};
  await pdf.destroy();
  return { pages, info: { title: info.Title, author: info.Author, date: info.CreationDate } };
}
export async function addLocalFile(file) {
  const project = currentProject();
  if (!file) return toast("Choose a PDF, Markdown, or text file first.");
  const origin = $("#evidence-origin").value;
  const ownWork = origin !== "external";
  const where = ownWork ? originOf(origin).label.toLowerCase() : "imported locally";
  const button = $("#upload-button");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const source = { id: crypto.randomUUID(), title: file.name, kind: ownWork ? "work" : isPdf ? "pdf" : "text", origin, detail: `${Math.max(1, Math.round(file.size / 1024))} KB · ${where}` };
  let pages;
  try {
    if (isPdf) {
      setBusy(button, "Reading PDF…");
      const { pages: pdfPages, info } = await readPdf(file);
      if (!ownWork) source.meta = pdfInfoMeta(info);
      pages = pdfPages.map(({ pageNo, text }) => ({ label: `p. ${pageNo}`, text }));
      source.detail = `${plural(pdfPages.length, "page")} · ${where}`;
    } else {
      const text = await file.text();
      source.capturedText = text;
      pages = [{ label: ownWork ? "Your text" : "Imported text", text }];
    }
  } catch {
    clearBusy(button);
    return toast("Lattice could not read that file. Try a text-based PDF or Markdown file.");
  }
  setBusy(button, "Extracting cards…");
  try {
    await ingestAndShow(project, source, pages, { mode: extractionMode(origin), activity: ["import", ownWork ? `Added ${where}: ${source.title}` : `Imported ${source.title}`, source.detail] });
    $("#file-input").value = "";
  } finally {
    clearBusy(button);
  }
}
export async function addPastedText() {
  const text = $("#source-text").value.trim();
  if (!text) return toast("Paste text first.");
  const origin = $("#evidence-origin").value;
  const ownWork = origin !== "external";
  const label = originOf(origin).label;
  const button = $("#text-button");
  const source = { id: crypto.randomUUID(), title: ownWork ? `${label} notes` : "Pasted text", kind: ownWork ? "work" : "text", origin, detail: ownWork ? `${label} · pasted text` : "Imported locally", capturedText: text };
  setBusy(button, "Extracting cards…");
  try {
    await ingestAndShow(currentProject(), source, [{ label: ownWork ? "Your text" : "Pasted text", text }], { mode: extractionMode(origin), activity: ["import", ownWork ? `Added ${label.toLowerCase()} notes` : "Added pasted text", "Imported locally"] });
    $("#source-text").value = "";
  } finally {
    clearBusy(button);
  }
}
export async function addUrlSource() {
  const value = $("#source-input").value.trim();
  if (!value) return toast("Add a URL or DOI first.");
  const project = currentProject();
  const button = $("#analyze-button");
  setBusy(button, "Reading link…");
  try {
    let fetched;
    try {
      const response = await fetch("/api/fetch-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }) });
      fetched = await response.json().catch(() => ({}));
      if (!response.ok || !fetched.pages?.length) throw new Error(fetched.error || "Lattice couldn't read that link");
    } catch (error) {
      const source = { id: crypto.randomUUID(), title: value.replace(/^https?:\/\//, ""), kind: "url", origin: "external", detail: "Link saved locally · not read", originalUrl: value };
      project.sources.push(source);
      recordActivity("import", "Saved a source link", source.title, project);
      saveWorkspace(); renderProject();
      return toast(`${error.message}. The link was saved, but no cards were created.`);
    }
    let host = "";
    try { host = new URL(fetched.finalUrl).hostname.replace(/^www\./, ""); } catch { host = "link"; }
    const extent = fetched.format === "pdf" ? plural(fetched.totalPages, "page") : "web page";
    const source = { id: crypto.randomUUID(), title: fetched.title || value.replace(/^https?:\/\//, ""), kind: "url", origin: "external", detail: `${host} · ${extent}`, originalUrl: value, fetched: true, meta: mergeMeta({ url: fetched.finalUrl }, fetched.meta, pdfInfoMeta(fetched.pdfInfo), fetched.crossref) };
    setBusy(button, "Extracting cards…");
    await ingestAndShow(project, source, fetched.pages, { mode: "link", truncated: fetched.truncated, activity: ["import", `Read ${source.title}`, host] });
    $("#source-input").value = "";
  } finally {
    clearBusy(button);
  }
}
export async function receiveBrowserCapture(payload) {
  const selection = String(payload?.selection || "").trim();
  const url = String(payload?.url || "").trim();
  if (!selection || !url) return;
  const title = String(payload?.title || new URL(url).hostname).trim();
  const source = { id: crypto.randomUUID(), title, kind: "web", origin: "external", detail: url, originalUrl: url, capturedText: selection };
  toast("Web passage captured. Extracting cards…");
  await ingestAndShow(currentProject(), source, [{ label: "Web capture", text: selection }], { activity: ["capture", `Captured a passage from ${title}`, url] });
}
