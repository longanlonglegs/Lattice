// The Library (saved sources) and Saved evidence (approved cards) views.
import { $, escapeHtml, toast, plural } from "./util.js";
import { workspace, normalizeProject, projectsByRecent, persist, sourceKind, recordActivity } from "./state.js";
import { openProject } from "./projects.js";
import { renderProject, sourceByline, sourceTitle } from "./workspace.js";
import { originBadge } from "./cards.js";

export function sourceHref(source) {
  const candidate = String(source.originalUrl || (source.kind === "web" ? source.detail : source.title) || "").trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^10\.\d{4,9}\//.test(candidate)) return `https://doi.org/${candidate}`;
  if (source.kind === "url" && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(candidate)) return `https://${candidate}`;
  return "";
}
export function sourceOrigin(source) {
  const href = sourceHref(source);
  if (!href) return source.detail || "Saved locally";
  try {
    const url = new URL(href);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`;
  } catch { return source.detail || "Saved locally"; }
}
export function allSources(projectId = "all") {
  return workspace.projects
    .filter(project => projectId === "all" || project.id === projectId)
    .flatMap(project => project.sources.map(source => ({ ...source, projectId: project.id, projectTitle: project.title, passages: project.cards.filter(card => card.sourceId === source.id).length })));
}
export function renderSourceLibrary() {
  const filter = $("#source-library-project-filter");
  const previous = filter.value || "all";
  filter.innerHTML = `<option value="all">All projects</option>${projectsByRecent().map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`).join("")}`;
  filter.value = workspace.projects.some(project => project.id === previous) || previous === "all" ? previous : "all";
  const query = $("#source-library-search").value.trim().toLowerCase();
  const sources = allSources(filter.value).filter(source => [sourceTitle(source), source.title, sourceByline(source), source.detail, source.capturedText].some(value => String(value || "").toLowerCase().includes(query)));
  const total = allSources().length;
  $("#library-nav-count").textContent = total;
  $("#library-summary").textContent = plural(total, "saved source");
  $("#source-library-list").innerHTML = sources.length ? sources.map(source => {
    const href = sourceHref(source);
    const preview = source.capturedText ? `<p class="source-preview">${escapeHtml(source.capturedText.slice(0, 260))}${source.capturedText.length > 260 ? "…" : ""}</p>` : "";
    return `<article class="library-source"><div class="library-source-kind">${sourceKind(source)}</div><div class="library-source-main"><div class="library-source-meta"><span>${escapeHtml(source.projectTitle)}</span><small>${plural(source.passages, "card")} extracted</small></div><h2>${escapeHtml(sourceTitle(source))}</h2>${sourceByline(source) ? `<p class="source-cite">${escapeHtml(sourceByline(source))}</p>` : ""}<p class="library-source-origin">${escapeHtml(sourceOrigin(source))}</p>${preview}</div><div class="library-source-actions">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}<button type="button" data-open-source-project="${escapeHtml(source.projectId)}">Open project</button></div></article>`;
  }).join("") : `<div class="empty-sources"><strong>${query ? "No sources match that search." : "Your source library is empty."}</strong><p>${query ? "Try a different title, URL, or phrase from a capture." : "Use + Add evidence in a project to keep a link, file, pasted text, or web capture here."}</p></div>`;
  $("#source-library-list").querySelectorAll("[data-open-source-project]").forEach(button => button.addEventListener("click", () => openProject(button.dataset.openSourceProject, "sources")));
}
export function approvedCards(projectId = "all") {
  return workspace.projects.filter(project => projectId === "all" || project.id === projectId).flatMap(project => project.cards.filter(item => item.state === "approved").map(item => ({ ...item, projectId: project.id, projectTitle: project.title })));
}
export function renderCardsLibrary() {
  const filter = $("#cards-project-filter");
  const previous = filter.value || "all";
  filter.innerHTML = `<option value="all">All projects</option>${projectsByRecent().map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`).join("")}`;
  filter.value = workspace.projects.some(project => project.id === previous) || previous === "all" ? previous : "all";
  const cards = approvedCards(filter.value);
  $("#approved-cards-list").innerHTML = cards.length ? cards.map(item => `
    <article class="saved-card" data-project-id="${escapeHtml(item.projectId)}" data-card-id="${escapeHtml(item.id)}"><div class="saved-meta"><span>${escapeHtml(item.projectTitle)}</span>${originBadge(item.origin)} ${escapeHtml(item.location)}</div><div><h3>${escapeHtml(item.claim)}</h3><p>“${escapeHtml(item.quote)}”</p></div><button type="button" data-remove-card>Remove</button></article>`).join("") : `<div class="empty-cards"><strong>No saved evidence yet.</strong><p>Save a useful card in Workspace and it will appear here.</p></div>`;
  $("#approved-cards-list").querySelectorAll("[data-remove-card]").forEach(button => button.addEventListener("click", () => {
    const item = button.closest(".saved-card");
    const project = workspace.projects.find(candidate => candidate.id === item.dataset.projectId);
    const entry = project?.cards.find(candidate => candidate.id === +item.dataset.cardId);
    if (entry) { entry.state = "pending"; recordActivity("decision", "Removed a card from saved evidence", entry.location, normalizeProject(project)); persist(); renderProject(); toast("Card removed from saved evidence."); }
  }));
}
