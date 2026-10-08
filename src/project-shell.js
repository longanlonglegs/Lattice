// The project shell: tabs (Web · Cards · Sources · Question & history · Insights) and the Add evidence drawer.
import { $, plural } from "./util.js";
import { currentProject } from "./state.js";
import { currentView } from "./views.js";
import { hasUnrecordedChanges, latestVersion } from "./history.js";
import { pipelineStatus, schedulePipeline } from "./pipeline.js";
import { renderWeb, webShown } from "./web/web-view.js";

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
  if (currentTab === "web") { webShown(); $("#toast").classList.remove("show"); } else $("#web-back-insights")?.classList.add("hidden");
  if ($(".project-tabs").getBoundingClientRect().top < 0) $(".project-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Number keys 1–5 switch project tabs, except while typing, with a modifier held, or when a dialog or drawer is open.
export function initTabHotkeys() {
  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const index = Number(event.key) - 1;
    if (!(index >= 0 && index < projectTabs.length)) return;
    const target = event.target;
    if (target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (currentView !== "workspace" || document.querySelector("dialog[open], .drawer:not(.hidden), .review-deck:not(.hidden)")) return;
    event.preventDefault();
    showTab(projectTabs[index]);
    document.querySelector(`[data-project-tab="${projectTabs[index]}"]`)?.focus({ preventScroll: true });
  });
}

export function renderTabs() {
  const project = currentProject();
  // Superseded hypothesis guesses are kept for history but are not ideas in the web.
  const cards = project.cards.filter(item => item.state === "approved" && !item.superseded);
  const accepted = project.cards.filter(item => item.state === "approved").length;
  const waiting = project.cards.filter(item => item.state === "pending" && !item.superseded).length;
  const question = project.question.trim();
  const hypothesis = project.hypothesis.trim();
  $("#tab-web-status").textContent = cards.length ? plural(cards.length, "idea") : "Empty";
  $("#tab-cards-status").textContent = `${plural(accepted, "card")}${waiting ? ` · ${waiting} to review` : ""}`;
  $("#tab-sources-status").textContent = plural(project.sources.length, "source");
  const latest = latestVersion(project);
  $("#tab-history-status").textContent = !question ? "Not started" : !latest ? (hypothesis ? "Question + hypothesis" : "Question set") : `Version ${latest.number}${hasUnrecordedChanges(project) ? " · edited" : ""}`;
  $("#tab-insights-status").textContent = project.aiAnalysis?.overview ? "AI read ready" : "Summary & gaps";
  renderWeb();
  renderPipelineStatus();
  schedulePipeline();
}

// The header chip appears only when the relationship pipeline has paused and needs a retry;
// progress itself is shown by the loading screen in the Web tab.
export function renderPipelineStatus() {
  const project = currentProject();
  const status = pipelineStatus();
  const state = status.projectId === project.id ? status.state : "idle";
  const chip = $("#pipeline-status");
  chip.dataset.state = state;
  chip.classList.toggle("hidden", state !== "no-key" && state !== "error");
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
