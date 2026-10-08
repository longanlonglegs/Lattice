// The Projects page and the sidebar's recent-projects list.
import { $, escapeHtml, plural, relativeTime } from "./util.js";
import { projectColours, workspace, currentProject, projectsByRecent, persist } from "./state.js";
import { showView } from "./views.js";
import { renderProject } from "./workspace.js";
import { showTab } from "./project-shell.js";
import { requestReview } from "./review.js";

export function renderProjectNav() {
  const project = currentProject();
  const projects = projectsByRecent();
  const colour = project ? projectColours[project.colour] : "transparent";
  $("#project-chip-title").textContent = project ? project.title : "No project";
  $("#project-chip-dot").style.background = colour;
  $("#ws-colour-dot").style.background = colour;
  $("#projects-nav-count").textContent = projects.length;
  $("#recent-projects").innerHTML = projects.slice(0, 4).map(item => `<button class="recent-project ${item.id === project?.id ? "active" : ""}" data-open-project="${escapeHtml(item.id)}" type="button"><i class="color-dot" style="background:${projectColours[item.colour]}"></i><span>${escapeHtml(item.title)}</span></button>`).join("");
  renderProjectsGrid();
}
export function renderProjectsGrid() {
  const query = $("#projects-search").value.trim().toLowerCase();
  const projects = projectsByRecent();
  const matches = projects.filter(item => [item.title, item.question].some(value => value.toLowerCase().includes(query)));
  $("#projects-summary").textContent = plural(projects.length, "project");
  $("#projects-grid").innerHTML = matches.length ? matches.map(item => {
    const waiting = item.cards.filter(entry => entry.state === "pending" && !entry.superseded).length;
    const evidence = item.cards.filter(entry => entry.state === "approved").length;
    const current = item.id === workspace.activeId;
    return `<article class="project-card ${current ? "current" : ""}" style="--project-colour:${projectColours[item.colour]}">
      <button class="project-open" data-open-project="${escapeHtml(item.id)}" type="button">
        <span class="project-card-top"><i class="color-dot"></i><span>${current ? "Current project" : `Edited ${relativeTime(item.updatedAt)}`}</span></span>
        <strong class="project-name">${escapeHtml(item.title)}</strong>
        <span class="project-question ${item.question ? "" : "empty"}">${escapeHtml(item.question || "No research question yet")}</span>
        <span class="project-stats"><span><b>${item.sources.length}</b> source${item.sources.length === 1 ? "" : "s"}</span><span><b>${evidence}</b> card${evidence === 1 ? "" : "s"}</span><span><b>${waiting}</b> to review</span></span>
      </button>
      <div class="project-card-footer"><small>${current ? `Edited ${relativeTime(item.updatedAt)}` : `Created ${new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}</small><button data-project-settings="${escapeHtml(item.id)}" type="button">Settings</button></div>
    </article>`;
  }).join("") : !projects.length ? `<div class="empty-sources"><strong>No projects yet.</strong><p>Start one with + New project. Each project holds a research question, its sources, and the cards you pull from them.</p></div>` : `<div class="empty-sources"><strong>No projects match that search.</strong><p>Try a different word from the name or research question.</p></div>`;
}
export function openProject(id, tab = "web") {
  workspace.activeId = id;
  persist(); renderProject(); showTab(tab); showView("workspace");
  requestReview(); // cards still waiting from an earlier session
}
