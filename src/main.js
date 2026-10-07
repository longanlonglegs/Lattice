// Entry point: wires up events and opens the first view.
import { $ } from "./util.js";
import { loaded, initWorkspace, currentProject, saveWorkspace, clearAiAnalysis } from "./state.js";
import { renderProjectsGrid, openProject } from "./projects.js";
import { viewSections, currentView, showView } from "./views.js";
import { renderProject, exportMarkdown, toggleActivityList } from "./workspace.js";
import { projectTabs, showTab, openDrawer, closeDrawer } from "./project-shell.js";
import { renderCards } from "./cards.js";
import { recordFromForm, renderVersionStatus } from "./history.js";
import { onPipelineChange, schedulePipeline } from "./pipeline.js";
import { renderPipelineStatus } from "./project-shell.js";
import { initWebControls, renderWeb } from "./web/web-view.js";
import { renderInsights, analyzeEvidence } from "./insights.js";
import { renderSourceLibrary, renderCardsLibrary } from "./library.js";
import { downloadBackup, restoreBackup, deleteWorkspace, exportProject, importProject } from "./privacy.js";
import { ob, renderOnboarding, openOnboarding, validateObStep, addObText, addObFiles, saveSettings, createProject, deleteProject } from "./onboarding.js";
import { addLocalFile, addPastedText, addUrlSource, receiveBrowserCapture } from "./ingest.js";

await initWorkspace();

let activeTab = "link";

document.querySelectorAll(".source-tab").forEach(tab => tab.addEventListener("click", () => {
  activeTab = tab.dataset.tab; document.querySelectorAll(".source-tab").forEach(item => item.classList.toggle("selected", item === tab));
  ["link", "upload", "text"].forEach(name => $("#" + name + "-panel").classList.toggle("hidden", name !== activeTab));
  $("#origin-picker").classList.toggle("hidden", activeTab === "link");
}));
window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.data?.type !== "LATTICE_EXTENSION_CAPTURE") return;
  receiveBrowserCapture(event.data.payload);
});
document.addEventListener("click", event => {
  const open = event.target.closest("[data-open-project]");
  if (open) return openProject(open.dataset.openProject);
  const settings = event.target.closest("[data-project-settings]");
  if (settings) return openOnboarding("edit", settings.dataset.projectSettings);
  if (event.target.closest("[data-new-project]")) openOnboarding("create");
});
$("#project-chip").addEventListener("click", () => showView("projects"));
$("#project-settings").addEventListener("click", () => openOnboarding("edit", currentProject().id));
$("#projects-search").addEventListener("input", renderProjectsGrid);
$("#ob-cancel").addEventListener("click", () => showView(currentView));
$("#ob-next").addEventListener("click", () => { if (!validateObStep(ob.step)) return; ob.step += 1; renderOnboarding(); });
$("#ob-back").addEventListener("click", () => { ob.step -= 1; renderOnboarding(); });
$("#ob-ack").addEventListener("change", () => { $("#ob-submit").disabled = ob.mode === "create" && !$("#ob-ack").checked; $("#ob-error").textContent = ""; });
$("#ob-add-text").addEventListener("click", addObText);
$("#ob-file").addEventListener("change", event => addObFiles([...event.target.files]));
$("#ob-form").addEventListener("submit", event => { event.preventDefault(); if (ob.mode === "create") createProject(); else saveSettings(); });
$("#ob-form").addEventListener("keydown", event => { if (event.key === "Enter" && event.target.tagName === "INPUT" && event.target.type !== "checkbox") event.preventDefault(); });
$("#ob-delete").addEventListener("click", deleteProject);
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
// Under 850 px the sidebar becomes a menu: the ☰ button opens it, and choosing anything (or the backdrop) closes it.
const setMenu = open => { document.body.classList.toggle("nav-open", open); $("#menu-button").setAttribute("aria-expanded", String(open)); };
$("#menu-button").addEventListener("click", () => setMenu(!document.body.classList.contains("nav-open")));
$("#nav-backdrop").addEventListener("click", () => setMenu(false));
document.querySelector(".sidebar").addEventListener("click", event => { if (event.target.closest("button, a")) setMenu(false); });
$("#brand-home").addEventListener("click", event => { event.preventDefault(); showView("workspace"); });
$("#how-it-works").addEventListener("click", () => { showTab("web"); showView("workspace"); });
document.querySelectorAll("[data-project-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.projectTab)));
document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.goto)));
document.querySelectorAll("[data-add-evidence]").forEach(button => button.addEventListener("click", openDrawer));
$("#drawer-close").addEventListener("click", closeDrawer);
$("#evidence-drawer").addEventListener("click", event => { if (event.target === event.currentTarget) closeDrawer(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
$("#cards-origin-filter").addEventListener("change", renderCards);
$("#cards-project-filter").addEventListener("change", renderCardsLibrary);
$("#source-library-project-filter").addEventListener("change", renderSourceLibrary);
$("#source-library-search").addEventListener("input", renderSourceLibrary);
$("#backup-button").addEventListener("click", downloadBackup);
$("#restore-input").addEventListener("change", event => restoreBackup(event.target.files[0]));
$("#delete-workspace").addEventListener("click", deleteWorkspace);
$("#export-project").addEventListener("click", exportProject);
$("#import-project-input").addEventListener("change", event => importProject(event.target.files[0]));
["#project-title", "#research-question", "#working-hypothesis"].forEach(selector => $(selector).addEventListener("input", () => { $("#save-status").textContent = "Saving…"; clearAiAnalysis(); saveWorkspace(); renderInsights(); renderVersionStatus(); }));
$("#record-version").addEventListener("click", recordFromForm);
$("#activity-toggle").addEventListener("click", toggleActivityList);
initWebControls();
$("#pipeline-status").addEventListener("click", () => schedulePipeline(0));
// New relations update the web and the card list (unless a card is being edited, to keep its focus).
onPipelineChange(() => {
  renderPipelineStatus(); renderWeb(); renderInsights({ tabs: false });
  if (!document.activeElement?.closest("#cards-grid")) renderCards();
});
$("#version-link-list").addEventListener("change", () => { $("#version-link-count").textContent = `(${document.querySelectorAll("#version-link-list input:checked").length} selected)`; });
$("#ai-consent").addEventListener("change", event => { $("#ai-analyze-button").disabled = !event.target.checked; });
$("#ai-analyze-button").addEventListener("click", analyzeEvidence);
$("#markdown-export").addEventListener("click", exportMarkdown);
$("#analyze-button").addEventListener("click", addUrlSource);
$("#upload-button").addEventListener("click", () => addLocalFile($("#file-input").files[0]));
$("#text-button").addEventListener("click", addPastedText);

// The hash remembers the view and, for a project, its tab: #workspace/cards
const [hashView, hashTab] = window.location.hash.slice(1).split("/");
renderProject();
showTab(projectTabs.includes(hashTab) ? hashTab : "web");
if (loaded.fresh) openOnboarding("create");
else showView(Object.keys(viewSections).filter(view => view !== "onboarding").includes(hashView) ? hashView : "workspace");
