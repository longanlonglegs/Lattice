// The project workspace: sources (with their details), activity trail, rendering, and Markdown export.
import { $, escapeHtml, toast, plural, relativeTime } from "./util.js";
import { currentProject, saveWorkspace, persist, sourceCode, sourceKind, isOwnWork, clearAiAnalysis } from "./state.js";
import { renderProjectNav } from "./projects.js";
import { renderInsights } from "./insights.js";
import { renderCards, updateProgress } from "./cards.js";
import { renderSourceLibrary, renderCardsLibrary } from "./library.js";
import { renderTabs } from "./project-shell.js";
import { renderHistory } from "./history.js";
import { originOf } from "./origins.js";
import { citationLine, cleanMeta, reference } from "./records.js";
import { projectEdges } from "./pipeline.js";
import { describeRelation } from "./relations.js";

let editingSourceId = null;

// The second line under a source: "Authors (year) · Venue" for external sources, label and date for your own work.
export function sourceByline(source) {
  if (isOwnWork(source)) return [originOf(source.origin).label, source.addedAt ? `added ${new Date(source.addedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""].filter(Boolean).join(" · ");
  return citationLine(source.meta);
}
export const sourceTitle = source => source.meta?.title || source.title;

function metaFormHtml(source) {
  const meta = source.meta || {};
  const field = (name, label, value, wide = false) => `<label class="${wide ? "wide" : ""}">${label}<input data-meta="${name}" value="${escapeHtml(value || "")}" /></label>`;
  return `<form class="meta-form" data-meta-form="${escapeHtml(source.id)}">
    ${field("title", "TITLE", meta.title || source.title, true)}
    ${field("authors", "AUTHORS (comma-separated)", (meta.authors || []).join(", "), true)}
    ${field("year", "YEAR", meta.year)}${field("venue", "JOURNAL / VENUE", meta.venue)}
    ${field("doi", "DOI", meta.doi)}${field("url", "URL", meta.url || source.originalUrl)}
    <div class="meta-form-actions"><button class="ghost-button" type="button" data-meta-doi>Fill from DOI</button><button class="ghost-button" type="button" data-meta-cancel>Cancel</button><button class="primary" type="submit">Save details</button></div>
  </form>`;
}

async function fillFromDoi(form) {
  const doi = form.querySelector('[data-meta="doi"]').value.trim();
  if (!doi) return toast("Enter a DOI first.");
  const button = form.querySelector("[data-meta-doi]");
  button.disabled = true; button.textContent = "Looking up…";
  try {
    const response = await fetch("/api/lookup-doi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doi }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.meta) throw new Error(payload.error || "Lattice couldn't look up that DOI");
    const meta = cleanMeta(payload.meta);
    for (const [name, value] of Object.entries(meta)) form.querySelector(`[data-meta="${name}"]`).value = Array.isArray(value) ? value.join(", ") : value;
    toast("Details filled from Crossref. Check them, then save.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false; button.textContent = "Fill from DOI";
  }
}

export function renderSourceList() {
  const project = currentProject();
  const sources = project.sources;
  $("#source-count").textContent = plural(sources.length, "source");
  $("#source-list").innerHTML = sources.length ? sources.slice().reverse().map(source => {
    const byline = sourceByline(source);
    const row = `<div class="source-chip ${isOwnWork(source) ? "own-work" : ""}"><span>${sourceCode(source)}</span><div><strong>${escapeHtml(sourceTitle(source))}</strong>${byline ? `<span class="source-cite">${escapeHtml(byline)}</span>` : ""}<small>${escapeHtml(source.detail || "Saved locally")}</small></div><div class="source-actions">${isOwnWork(source) ? "" : `<button data-edit-source="${escapeHtml(source.id)}" type="button">Edit details</button>`}<button data-remove-source="${escapeHtml(source.id)}" type="button" aria-label="Remove ${escapeHtml(source.title)}">×</button></div></div>`;
    return row + (source.id === editingSourceId ? metaFormHtml(source) : "");
  }).join("") : `<p class="source-empty">No sources yet. Use + Add evidence to add a link, a file, or pasted text.</p>`;
  $("#source-list").querySelectorAll("[data-remove-source]").forEach(button => button.addEventListener("click", () => {
    const linked = project.cards.filter(item => item.sourceId === button.dataset.removeSource).length;
    if (linked && !window.confirm(`Remove this source and its ${plural(linked, "card")}?`)) return;
    project.sources = project.sources.filter(source => source.id !== button.dataset.removeSource);
    project.cards = project.cards.filter(item => item.sourceId !== button.dataset.removeSource);
    clearAiAnalysis();
    saveWorkspace(); renderProject(); toast(linked ? `Source and ${plural(linked, "card")} removed.` : "Source removed from this project.");
  }));
  $("#source-list").querySelectorAll("[data-edit-source]").forEach(button => button.addEventListener("click", () => {
    editingSourceId = editingSourceId === button.dataset.editSource ? null : button.dataset.editSource;
    renderSourceList();
  }));
  const form = $("#source-list").querySelector("[data-meta-form]");
  if (!form) return;
  form.querySelector("[data-meta-cancel]").addEventListener("click", () => { editingSourceId = null; renderSourceList(); });
  form.querySelector("[data-meta-doi]").addEventListener("click", () => fillFromDoi(form));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const source = project.sources.find(item => item.id === form.dataset.metaForm);
    const values = Object.fromEntries([...form.querySelectorAll("[data-meta]")].map(input => [input.dataset.meta, input.value]));
    source.meta = cleanMeta(values);
    editingSourceId = null;
    project.updatedAt = new Date().toISOString();
    persist(); renderProject(); toast("Source details saved.");
  });
}
// The full history is kept; the trail shows the latest few until "Show all" is clicked.
const TRAIL_PREVIEW = 8;
let trailExpanded = false;
export function toggleActivityList() {
  trailExpanded = !trailExpanded;
  renderActivityList();
}
export function renderActivityList() {
  const all = currentProject().activities;
  const activities = trailExpanded ? all : all.slice(0, TRAIL_PREVIEW);
  const icons = { capture: "↗", decision: "✓", setup: "◆", analysis: "✦", edit: "✎" };
  const toggle = $("#activity-toggle");
  toggle.classList.toggle("hidden", all.length <= TRAIL_PREVIEW);
  toggle.textContent = trailExpanded ? "Show fewer" : `Show all ${all.length}`;
  $("#activity-list").innerHTML = activities.length ? activities.map(activity => `
    <li><span class="activity-icon ${escapeHtml(activity.type)}">${icons[activity.type] || "＋"}</span><div><strong>${escapeHtml(activity.text)}</strong><small>${escapeHtml(activity.detail ? `${activity.detail} · ` : "")}${relativeTime(activity.createdAt)}</small></div></li>`).join("") : `
    <li class="empty-activity"><span class="activity-icon">○</span><div><strong>Your research trail will appear here.</strong><small>Import a source or capture a web passage to get started.</small></div></li>`;
}
export function renderProject() {
  const project = currentProject();
  $("#project-title").value = project.title;
  $("#research-question").value = project.question;
  $("#working-hypothesis").value = project.hypothesis;
  $("#card-count").textContent = project.cards.length;
  renderProjectNav(); renderSourceList(); renderActivityList(); renderInsights(); renderCards(); updateProgress(); renderCardsLibrary(); renderSourceLibrary(); renderHistory(); renderTabs();
}
export function exportMarkdown() {
  const project = currentProject();
  const approved = project.cards.filter(item => item.state === "approved");
  const records = approved.length ? approved : project.cards.filter(item => item.state !== "rejected");
  const cardById = new Map(project.cards.map(item => [item.id, item]));
  const edges = projectEdges(project);
  const sourceLine = source => isOwnWork(source) ? `- ${sourceByline(source)}: ${source.title}` : `- ${reference(source.meta, source.title)}${Object.keys(source.meta || {}).length ? "" : ` (${sourceKind(source)}${source.originalUrl ? `, ${source.originalUrl}` : ""})`}`;
  // "- Contradicts (My experiment): … — rationale"
  const relationLines = item => edges.filter(edge => edge.a === item.id || edge.b === item.id).sort((p, q) => q.confidence - p.confidence).flatMap(edge => {
    const { label, otherId } = describeRelation(edge, item.id);
    const other = cardById.get(otherId);
    return other ? [`- ${label} (${originOf(other.origin).label}): ${other.claim} — ${edge.rationale}`] : [];
  });
  const cardBlock = item => {
    const relations = relationLines(item);
    return [`### ${item.claim}`, "", ...item.quotes.flatMap(quote => [`> ${quote.text}`, `> — ${quote.location}`, ""]), originOf(item.origin).label, ...(item.note ? ["", `Note: ${item.note}`] : []), ...(relations.length ? ["", "Relations:", ...relations] : []), ""];
  };
  const guesses = project.cards.filter(item => item.origin === "hypothesis" && !item.superseded);
  const versions = project.versions.slice().reverse().flatMap(version => [`### Version ${version.number} · ${new Date(version.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`, "", ...(version.note ? [`Note: ${version.note}`, ""] : []), `Question: ${version.question || "—"}`, "", `Hypothesis: ${version.hypothesis || "—"}`, ""]);
  const stickies = project.stickies.filter(sticky => sticky.text.trim());
  const body = [
    "# " + project.title, "", "## Research question", project.question || "Untitled research question", "",
    "## Working hypothesis", project.hypothesis || "Not yet stated", "",
    ...(guesses.length ? ["## Hypothesis guesses", "", ...guesses.flatMap(cardBlock)] : []),
    "## Sources", ...project.sources.map(sourceLine), "",
    `## Evidence${approved.length ? " (saved cards)" : ""}`, "", ...records.filter(item => item.origin !== "hypothesis").flatMap(cardBlock),
    ...(versions.length ? ["## Question and hypothesis history", "", ...versions] : []),
    ...(stickies.length ? ["## Sticky notes", "", ...stickies.map(sticky => `- ${sticky.text.trim().replace(/\n+/g, " ")}`), ""] : [])
  ].join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([body], { type: "text/markdown" })); link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lattice-project"}.md`; link.click(); URL.revokeObjectURL(link.href);
  toast("Project exported as Markdown.");
}
