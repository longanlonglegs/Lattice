// Switching between the top-level views and the top bar that labels them.
import { $ } from "./util.js";
import { renderProjectsGrid } from "./projects.js";
import { renderSourceLibrary } from "./library.js";
import { renderPrivacy } from "./privacy.js";
import { ob } from "./onboarding.js";
import { currentTab } from "./project-shell.js";
import { webShown } from "./web/web-view.js";
import { currentProject } from "./state.js";

export const viewSections = { projects: "#projects-view", onboarding: "#onboarding-view", workspace: "#workspace", library: "#library-view", how: "#how-view", privacy: "#privacy-view" };
export let currentView = "workspace";
export function showView(view) {
  if (view === "workspace" && !currentProject()) view = "projects"; // nothing to open yet
  if (view !== "onboarding") currentView = view;
  const hash = view === "workspace" ? `#workspace/${currentTab}` : `#${view}`;
  if (view !== "onboarding" && window.location.hash !== hash) history.replaceState(null, "", hash);
  Object.entries(viewSections).forEach(([name, selector]) => $(selector).classList.toggle("hidden", name !== view));
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === (view === "onboarding" ? "projects" : view)));
  updateViewContext(view);
  if (view === "projects") { $("#projects-search").value = ""; renderProjectsGrid(); }
  if (view === "library") renderSourceLibrary();
  if (view === "privacy") renderPrivacy();
  if (view === "workspace" && currentTab === "web") webShown();
  window.scrollTo({ top: 0 });
}
export function updateViewContext(view) {
  const labels = { projects: "Projects", onboarding: ob.mode === "create" ? "New project" : "Project settings", workspace: "Workspace", library: "Library", how: "How it works", privacy: "Privacy & data" };
  $("#topbar-view").textContent = labels[view] || "Workspace";
  const isWorkspace = view === "workspace";
  $("#project-context").classList.toggle("hidden", !isWorkspace);
  $("#topbar-divider").classList.toggle("hidden", !isWorkspace);
  $("#topbar-status").textContent = { workspace: "Saved locally", projects: "Most recent first", library: "All saved sources", how: "Guide", privacy: "Local controls", onboarding: "Not saved until you finish" }[view] || "Saved locally";
}
