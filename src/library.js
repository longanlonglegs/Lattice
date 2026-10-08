// The Library: every source across projects.
import { $, escapeHtml, plural } from "./util.js";
import { workspace, projectsByRecent, sourceKind } from "./state.js";
import { openProject } from "./projects.js";
import { sourceByline, sourceTitle } from "./workspace.js";
import { icon } from "./icons.js";

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
    .flatMap(project => project.sources.map(source => ({ ...source, projectId: project.id, projectTitle: project.title, passages: project.cards.filter(card => card.sourceId === source.id && card.state === "approved").length })));
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
    return `<article class="library-source"><div class="library-source-kind">${sourceKind(source)}</div><div class="library-source-main"><div class="library-source-meta"><span>${escapeHtml(source.projectTitle)}</span><small>${plural(source.passages, "card")} extracted</small></div><h2>${escapeHtml(sourceTitle(source))}</h2>${sourceByline(source) ? `<p class="source-cite">${escapeHtml(sourceByline(source))}</p>` : ""}<p class="library-source-origin">${escapeHtml(sourceOrigin(source))}</p>${preview}</div><div class="library-source-actions">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open source ${icon("external")}</a>` : ""}<button type="button" data-open-source-project="${escapeHtml(source.projectId)}">Open project</button></div></article>`;
  }).join("") : `<div class="empty-sources"><strong>${query ? "No sources match that search." : "Your source library is empty."}</strong><p>${query ? "Try a different title, URL, or phrase from a capture." : "Use + Add evidence in a project to keep a link, file, pasted text, or web capture here."}</p></div>`;
  $("#source-library-list").querySelectorAll("[data-open-source-project]").forEach(button => button.addEventListener("click", () => openProject(button.dataset.openSourceProject, "sources")));
}
