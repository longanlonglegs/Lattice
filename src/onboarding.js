// New-project setup and project settings.
import { $, escapeHtml, toast, plural } from "./util.js";
import { defaultTitle, projectColours, colourKeys, newProject, workspace, normalizeProject, projectsByRecent, isPristinePlaceholder, persist, recordActivity } from "./state.js";
import { openProject } from "./projects.js";
import { currentView, showView } from "./views.js";
import { renderProject } from "./workspace.js";
import { queueSource, readPdf } from "./ingest.js";
import { origins, pickableOrigins, extractionMode } from "./origins.js";
import { pdfInfoMeta } from "./records.js";
import { recordVersion } from "./history.js";
import { forgetProject } from "./pipeline.js";

const originSelect = item => `<select class="work-origin" data-work-origin="${item.id}" aria-label="Where is ${escapeHtml(item.title)} from?">${pickableOrigins.map(key => `<option value="${key}" ${key === item.origin ? "selected" : ""}>${origins[key].label}</option>`).join("")}</select>`;

export const ob = { mode: "create", step: 1, projectId: null, colour: "sage", work: [] };

const colourName = key => `${key[0].toUpperCase()}${key.slice(1)}`;
// A radio group: one tab stop (the chosen colour), arrow keys move the choice.
export function renderColourPicker({ focus = false } = {}) {
  $("#ob-colours").innerHTML = colourKeys.map(key => `<button class="colour-swatch" type="button" role="radio" aria-checked="${key === ob.colour}" tabindex="${key === ob.colour ? 0 : -1}" aria-label="${colourName(key)}" title="${colourName(key)}" data-colour="${key}" style="--swatch:${projectColours[key]}"></button>`).join("");
  const choose = (key, refocus) => { ob.colour = key; renderColourPicker({ focus: refocus }); };
  $("#ob-colours").querySelectorAll("[data-colour]").forEach(button => {
    button.addEventListener("click", () => choose(button.dataset.colour, true));
    button.addEventListener("keydown", event => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      choose(colourKeys[(colourKeys.indexOf(ob.colour) + step + colourKeys.length) % colourKeys.length], true);
    });
  });
  if (focus) $("#ob-colours [aria-checked='true']").focus();
}
export function renderWorkList() {
  $("#ob-work-list").innerHTML = ob.work.map(item => `<li class="work-item ${item.status === "error" ? "error" : ""}"><span class="kind-chip own-work">${item.kind === "pdf" ? "PDF" : "TXT"}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.note)}</small></div>${item.status === "error" ? "" : originSelect(item)}${item.status === "reading" ? "" : `<button type="button" data-remove-work="${item.id}" aria-label="Remove ${escapeHtml(item.title)}">×</button>`}</li>`).join("");
  $("#ob-work-list").querySelectorAll("[data-work-origin]").forEach(select => select.addEventListener("change", () => { ob.work.find(item => item.id === select.dataset.workOrigin).origin = select.value; }));
  $("#ob-work-list").querySelectorAll("[data-remove-work]").forEach(button => button.addEventListener("click", () => { ob.work = ob.work.filter(item => item.id !== button.dataset.removeWork); renderWorkList(); }));
}
export function renderOnboarding() {
  const view = $("#onboarding-view");
  view.dataset.mode = ob.mode;
  view.dataset.obStep = ob.step;
  const create = ob.mode === "create";
  document.querySelectorAll("#ob-progress [data-ob-index]").forEach(item => {
    const index = +item.dataset.obIndex;
    item.classList.toggle("active", index === ob.step);
    item.classList.toggle("done", index < ob.step);
    if (index === ob.step) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
  });
  $("#ob-back").classList.toggle("hidden", !create || ob.step === 1);
  $("#ob-next").classList.toggle("hidden", !create || ob.step === 4);
  $("#ob-submit").classList.toggle("hidden", create && ob.step !== 4);
  $("#ob-submit").innerHTML = create ? "Create project <span aria-hidden=\"true\">→</span>" : "Save changes";
  // Create stays clickable: if the privacy box isn't ticked, clicking it says so (a disabled button can't explain itself).
  $("#ob-submit").disabled = false;
  clearObError();
}
const stepNames = ["Basics", "Research focus", "Your work so far", "Privacy"];
// After Next or Back: move focus to the new step's heading and announce where the user is.
export function focusObStep() {
  if (ob.mode !== "create") return;
  $(`[data-ob-section="${ob.step}"] h2`)?.focus();
  $("#ob-step-status").textContent = `Step ${ob.step} of 4: ${stepNames[ob.step - 1]}`;
}
export function clearObError() {
  $("#ob-error").textContent = "";
  $("#ob-question").removeAttribute("aria-invalid");
}
export function openOnboarding(mode, projectId = null) {
  ob.mode = mode;
  ob.step = 1;
  ob.work = [];
  ob.projectId = projectId;
  const project = projectId ? normalizeProject(workspace.projects.find(item => item.id === projectId)) : null;
  const used = new Set(workspace.projects.map(item => item.colour));
  ob.colour = project ? project.colour : colourKeys.find(key => !used.has(key)) || colourKeys[Math.floor(Math.random() * colourKeys.length)];
  $("#ob-eyebrow").textContent = project ? "Project settings" : "New project";
  $("#ob-title").textContent = project ? project.title : "Set up your project";
  $("#ob-privacy-help").textContent = project ? "How data in this project is stored and shared." : "Please read this before you create the project.";
  $("#ob-lede").textContent = project ? "Update the basics and research focus for this project. Changes save when you click Save changes." : "A few questions so Lattice knows what you’re working on. You can change any of this later from Project settings.";
  $("#ob-name").value = project ? project.title : "";
  $("#ob-question").value = project ? project.question : "";
  $("#ob-hypothesis").value = project ? project.hypothesis : "";
  $("#ob-work-text").value = ""; $("#ob-work-label").value = ""; $("#ob-file").value = "";
  const acknowledged = project?.acknowledgedAt;
  $("#ob-ack").checked = Boolean(acknowledged);
  $(".ob-ack").classList.toggle("hidden", Boolean(acknowledged));
  $("#ob-acked").classList.toggle("hidden", !acknowledged);
  $("#ob-acked").textContent = acknowledged ? `You acknowledged this on ${new Date(acknowledged).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.` : "";
  $("#ob-danger-help").textContent = "Removes the project, its sources, cards, and activity from this browser. This can’t be undone unless you have a backup.";
  $("#ob-form").classList.remove("hidden");
  $("#ob-cancel").disabled = false;
  renderColourPicker(); renderWorkList(); renderOnboarding();
  showView("onboarding");
  if (!project) $("#ob-name").focus();
}
export function validateObStep(step) {
  if (step === 2 && !$("#ob-question").value.trim()) {
    $("#ob-error").textContent = "Add a research question to continue. A rough one is fine; you can refine it later.";
    $("#ob-question").setAttribute("aria-invalid", "true");
    $("#ob-question").focus();
    return false;
  }
  if (step === 3 && $("#ob-work-text").value.trim()) addObText();
  return true;
}
export function addObText() {
  const text = $("#ob-work-text").value.trim();
  if (!text) { $("#ob-error").textContent = "Paste some text first."; return; }
  const title = $("#ob-work-label").value.trim() || `Your notes ${ob.work.filter(item => item.kind === "text").length + 1}`;
  ob.work.push({ id: crypto.randomUUID(), kind: "text", origin: "experiment", title, text, pages: [{ label: "Your text", text }], note: `${text.split(/\s+/).length} words` });
  $("#ob-work-text").value = ""; $("#ob-work-label").value = ""; $("#ob-error").textContent = "";
  renderWorkList();
}
export async function addObFiles(files) {
  for (const file of files) {
    const item = { id: crypto.randomUUID(), kind: "pdf", origin: "experiment", title: file.name, pages: [], note: "Reading PDF…", status: "reading" };
    ob.work.push(item); renderWorkList();
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      Object.assign(item, { status: "error", note: "Only PDFs are supported for now." });
    } else {
      try {
        const { pages, info } = await readPdf(file);
        item.info = info;
        if (!pages.length) Object.assign(item, { status: "error", note: "No selectable text found. Scanned PDFs aren’t supported yet." });
        else Object.assign(item, { status: "ready", pages: pages.map(({ pageNo, text }) => ({ label: `p. ${pageNo}`, text })), note: `${plural(pages.length, "page")} · ${Math.max(1, Math.round(file.size / 1024))} KB` });
      } catch (error) {
        Object.assign(item, { status: "error", note: error.missingReader ? error.message : "Lattice couldn’t read this PDF." });
      }
    }
    renderWorkList();
  }
  $("#ob-file").value = "";
}
export function saveSettings() {
  const project = normalizeProject(workspace.projects.find(item => item.id === ob.projectId));
  // The question and hypothesis are edited only in Question & history, where every change can be recorded as a
  // version; settings covers the name, colour, and privacy acknowledgement.
  Object.assign(project, { title: $("#ob-name").value.trim() || defaultTitle, colour: ob.colour, placeholder: false, updatedAt: new Date().toISOString() });
  if (!project.acknowledgedAt && $("#ob-ack").checked) project.acknowledgedAt = new Date().toISOString();
  recordActivity("setup", "Updated project settings", "", project);
  persist(); renderProject();
  showView(currentView === "projects" ? "projects" : "workspace");
  toast("Project settings saved.");
}
export async function createProject() {
  if (!$("#ob-ack").checked) { $("#ob-error").textContent = "Tick the box above to confirm you’ve read how Lattice handles this project’s data, then create the project."; $("#ob-ack").focus(); return; }
  if (ob.work.some(item => item.status === "reading")) { $("#ob-error").textContent = "A PDF is still being read. Wait for it to finish, then create the project."; return; }
  const now = new Date().toISOString();
  const project = newProject($("#ob-name").value.trim() || defaultTitle, { colour: ob.colour, question: $("#ob-question").value.trim(), hypothesis: $("#ob-hypothesis").value.trim(), acknowledgedAt: now });
  workspace.projects = workspace.projects.filter(item => !isPristinePlaceholder(normalizeProject(item)));
  workspace.projects.unshift(project);
  workspace.activeId = project.id;
  recordActivity("setup", "Created the project", "", project);
  persist(); renderProject();
  // Setup records version 1; its hypothesis guesses arrive in the background.
  recordVersion(project, { note: "Starting point, from project setup" });
  // Setup doesn't wait for your work: the project opens straight away and each item is read in the import queue.
  const work = ob.work.filter(item => item.status !== "error" && item.status !== "reading" && item.pages.length);
  for (const item of work) {
    const label = origins[item.origin].label;
    const ownWork = item.origin !== "external";
    const source = { id: crypto.randomUUID(), title: item.title, kind: ownWork ? "work" : item.kind, origin: item.origin, detail: item.kind === "pdf" ? `${plural(item.pages.length, "page")} · ${label.toLowerCase()}` : `${label} · pasted text`, ...(item.kind === "text" ? { capturedText: item.text } : {}), ...(item.info && !ownWork ? { meta: pdfInfoMeta(item.info) } : {}) };
    queueSource(project, source, item.pages, { mode: extractionMode(item.origin), activity: ["import", `Added ${label.toLowerCase()}: ${item.title}`, source.detail] });
  }
  openProject(project.id);
  // The web's starting point takes it from here: the question, the hypothesis, and what is being read.
  toast(`${project.title} is ready.`);
}

export function deleteProject() {
  const project = workspace.projects.find(item => item.id === ob.projectId);
  if (!project) return;
  if (!window.confirm(`Delete “${project.title}” and all its sources, cards, and activity? This cannot be undone unless you have a backup.`)) return;
  workspace.projects = workspace.projects.filter(item => item.id !== project.id);
  if (workspace.activeId === project.id) workspace.activeId = projectsByRecent()[0]?.id || null;
  forgetProject(project.id).catch(error => console.error("Could not remove the project’s relationships", error));
  persist(); renderProject(); showView("projects"); toast(`${project.title} deleted.`);
}
