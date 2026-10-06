// The project shell: tabs (Web · Cards · Sources · Question & history · Insights) and the Add evidence drawer.
import { $, plural } from "./util.js";
import { currentProject } from "./state.js";
import { currentView } from "./views.js";
import { hasUnrecordedChanges, latestVersion } from "./history.js";
import { pipelineStatus, schedulePipeline } from "./pipeline.js";
import { renderWeb } from "./web/web-view.js";

export const projectTabs = ["web", "cards", "sources", "history", "insights"];
export let currentTab = "web";

export function showTab(tab) {
  currentTab = projectTabs.includes(tab) ? tab : "web";
  $("#workspace").dataset.activeTab = currentTab;
  document.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("hidden", panel.dataset.panel !== currentTab));
  document.querySelectorAll("[data-project-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.projectTab === currentTab);
    if (button.dataset.projectTab === currentTab) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (currentView === "workspace") history.replaceState(null, "", `#workspace/${currentTab}`);
  if ($(".project-tabs").getBoundingClientRect().top < 0) $(".project-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

export function renderTabs() {
  const project = currentProject();
  // Superseded hypothesis guesses are kept for history but are not ideas in the web.
  const cards = project.cards.filter(item => item.state !== "rejected" && !item.superseded);
  const reviewed = project.cards.filter(item => item.state !== "pending").length;
  const saved = project.cards.filter(item => item.state === "approved").length;
  const question = project.question.trim();
  const hypothesis = project.hypothesis.trim();
  $("#tab-web-status").textContent = cards.length ? plural(cards.length, "idea") : "Empty";
  $("#tab-cards-status").textContent = `${reviewed} of ${project.cards.length} reviewed`;
  $("#tab-sources-status").textContent = plural(project.sources.length, "source");
  const latest = latestVersion(project);
  $("#tab-history-status").textContent = !question ? "Not started" : !latest ? (hypothesis ? "Question + hypothesis" : "Question set") : `Version ${latest.number}${hasUnrecordedChanges(project) ? " · edited" : ""}`;
  $("#tab-insights-status").textContent = project.aiAnalysis ? "AI read ready" : `${saved} saved`;
  renderWeb();
  renderPipelineStatus();
  schedulePipeline();
}

// The header chip: what the relationship pipeline is doing for this project.
export function renderPipelineStatus() {
  const project = currentProject();
  const status = pipelineStatus();
  const state = status.projectId === project.id ? status.state : "idle";
  const chip = $("#pipeline-status");
  chip.dataset.state = state;
  chip.textContent = {
    embedding: `Reading ideas… ${status.left} left`,
    relating: `Connecting ideas… ${status.left} pairs left`,
    done: "Ideas up to date",
    "no-key": "Paused: AI not configured",
    error: "Paused: couldn't reach the AI"
  }[state] || "Checking ideas…";
  chip.title = state === "no-key" || state === "error" ? "Click to try again" : "Lattice finds how your ideas relate in the background";
}

export function openDrawer() {
  $("#evidence-drawer").classList.remove("hidden");
  $("#drawer-close").focus();
}
export function closeDrawer() {
  $("#evidence-drawer").classList.add("hidden");
}
