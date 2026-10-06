// New-project setup and project settings.
import { $, escapeHtml, toast, plural } from "./util.js";
import { defaultTitle, projectColours, colourKeys, newProject, workspace, normalizeProject, projectsByRecent, isPristinePlaceholder, persist, recordActivity } from "./state.js";
import { openProject } from "./projects.js";
import { currentView, showView } from "./views.js";
import { renderProject } from "./workspace.js";
import { ingestSource, readPdf } from "./ingest.js";
import { origins, pickableOrigins, extractionMode } from "./origins.js";
import { pdfInfoMeta } from "./records.js";
import { recordVersion } from "./history.js";
import { forgetProject } from "./pipeline.js";

const originSelect = item => `<select class="work-origin" data-work-origin="${item.id}" aria-label="Where is ${escapeHtml(item.title)} from?">${pickableOrigins.map(key => `<option value="${key}" ${key === item.origin ? "selected" : ""}>${origins[key].label}</option>`).join("")}</select>`;

export const ob = { mode: "create", step: 1, projectId: null, colour: "sage", work: [], busy: false };

export function renderColourPicker() {
  $("#ob-colours").innerHTML = colourKeys.map(key => `<button class="colour-swatch" type="button" role="radio" aria-checked="${key === ob.colour}" aria-label="${key}" title="${key[0].toUpperCase()}${key.slice(1)}" data-colour="${key}" style="--swatch:${projectColours[key]}"></button>`).join("");
  $("#ob-colours").querySelectorAll("[data-colour]").forEach(button => button.addEventListener("click", () => { ob.colour = button.dataset.colour; renderColourPicker(); }));
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
  });
  $("#ob-back").classList.toggle("hidden", !create || ob.step === 1);
  $("#ob-next").classList.toggle("hidden", !create || ob.step === 4);
  $("#ob-submit").classList.toggle("hidden", create && ob.step !== 4);
  $("#ob-submit").innerHTML = create ? "Create project <span>→</span>" : "Save changes";
  $("#ob-submit").disabled = create && !$("#ob-ack").checked;
  $("#ob-error").textContent = "";
}
export function openOnboarding(mode, projectId = null) {
  if (ob.busy) return;
  ob.mode = mode;
  ob.step = 1;
  ob.work = [];
  ob.projectId = projectId;
  const project = projectId ? normalizeProject(workspace.projects.find(item => item.id === projectId)) : null;
  const used = new Set(workspace.projects.map(item => item.colour));
  ob.colour = project ? project.colour : colourKeys.find(key => !used.has(key)) || colourKeys[Math.floor(Math.random() * colourKeys.length)];
  $("#ob-eyebrow").textContent = project ? "PROJECT SETTINGS" : "NEW PROJECT";
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
  $("#ob-acked").textContent = acknowledged ? `✓ You acknowledged this on ${new Date(acknowledged).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.` : "";
  const onlyProject = workspace.projects.length < 2;
  $("#ob-delete").disabled = onlyProject;
  $("#ob-danger-help").textContent = onlyProject ? "This is your only project. Create another one before deleting it." : "Removes the project, its sources, cards, and activity from this browser. This can’t be undone unless you have a backup.";
  $("#ob-form").classList.remove("hidden");
  $("#ob-processing").classList.add("hidden");
  $("#ob-cancel").disabled = false;
  renderColourPicker(); renderWorkList(); renderOnboarding();
  showView("onboarding");
  if (!project) $("#ob-name").focus();
}
export function validateObStep(step) {
  if (step === 2 && !$("#ob-question").value.trim()) {
    $("#ob-error").textContent = "Add a research question to continue. A rough one is fine; you can refine it later.";
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
      } catch {
        Object.assign(item, { status: "error", note: "Lattice couldn’t read this PDF." });
      }
    }
    renderWorkList();
  }
  $("#ob-file").value = "";
}
export function saveSettings() {
  const project = normalizeProject(workspace.projects.find(item => item.id === ob.projectId));
  const question = $("#ob-question").value.trim();
  const hypothesis = $("#ob-hypothesis").value.trim();
  if (question !== project.question || hypothesis !== project.hypothesis) project.aiAnalysis = null;
  Object.assign(project, { title: $("#ob-name").value.trim() || defaultTitle, colour: ob.colour, question, hypothesis, placeholder: false, updatedAt: new Date().toISOString() });
  if (!project.acknowledgedAt && $("#ob-ack").checked) project.acknowledgedAt = new Date().toISOString();
  recordActivity("setup", "Updated project settings", "", project);
  persist(); renderProject();
  showView(currentView === "projects" ? "projects" : "workspace");
  toast("Project settings saved.");
}
export async function createProject() {
  if (!$("#ob-ack").checked) { $("#ob-error").textContent = "Please confirm you understand how Lattice handles this project’s data."; return; }
  if (ob.work.some(item => item.status === "reading")) { $("#ob-error").textContent = "A PDF is still being read. Wait for it to finish, then create the project."; return; }
  const now = new Date().toISOString();
  const project = newProject($("#ob-name").value.trim() || defaultTitle, { colour: ob.colour, question: $("#ob-question").value.trim(), hypothesis: $("#ob-hypothesis").value.trim(), acknowledgedAt: now });
  workspace.projects = workspace.projects.filter(item => !isPristinePlaceholder(normalizeProject(item)));
  workspace.projects.unshift(project);
  workspace.activeId = project.id;
  recordActivity("setup", "Created the project", "", project);
  persist(); renderProject();
  // Setup records version 1; its hypothesis guesses arrive in the background.
  const firstVersion = recordVersion(project, { note: "Starting point, from project setup" });
  const work = ob.work.filter(item => item.status !== "error" && item.status !== "reading" && item.pages.length);
  if (!work.length) { openProject(project.id); toast(`${project.title} is ready. Use + Add evidence to add your first source.`); return; }

  ob.busy = true;
  $("#ob-cancel").disabled = true;
  $("#ob-form").classList.add("hidden");
  $("#ob-processing").classList.remove("hidden");
  $("#ob-processing-title").textContent = "Reading your work…";
  $("#ob-open").disabled = true;
  const rows = work.map(item => ({ ...item, note: "Waiting…" }));
  const renderRows = () => { $("#ob-processing-list").innerHTML = rows.map(row => `<li class="work-item ${row.state || ""}"><span class="kind-chip own-work">${row.kind === "pdf" ? "PDF" : "TXT"}</span><div><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.note)}</small></div></li>`).join(""); };
  renderRows();
  let total = 0;
  for (const row of rows) {
    row.note = row.origin === "draft" ? "Extracting the claims your draft makes…" : row.origin === "external" ? "Extracting evidence…" : "Extracting your findings and conclusions…"; row.state = "working"; renderRows();
    const label = origins[row.origin].label;
    const ownWork = row.origin !== "external";
    const source = { id: crypto.randomUUID(), title: row.title, kind: ownWork ? "work" : row.kind, origin: row.origin, detail: row.kind === "pdf" ? `${plural(row.pages.length, "page")} · ${label.toLowerCase()}` : `${label} · pasted text`, ...(row.kind === "text" ? { capturedText: row.text } : {}), ...(row.info && !ownWork ? { meta: pdfInfoMeta(row.info) } : {}) };
    const result = await ingestSource(project, source, row.pages, { mode: extractionMode(row.origin), activity: ["import", `Added ${label.toLowerCase()}: ${row.title}`, source.detail] });
    total += result.cards.length;
    row.state = result.cards.length ? "done" : "error";
    row.note = result.cards.length ? `${plural(result.cards.length, "card")} · ${result.method === "ai" ? "AI extraction" : `basic extraction (${result.reason})`}` : "No usable findings found";
    renderRows();
  }
  await firstVersion;
  ob.busy = false;
  $("#ob-cancel").disabled = false;
  $("#ob-processing-title").textContent = total ? `${plural(total, "evidence card")} ready` : "Your project is ready";
  $("#ob-processing-help").textContent = total ? "Review them in the project: save the useful ones and reject anything that’s off." : "Lattice couldn’t pull findings from this work. You can add more with + Add evidence.";
  $("#ob-open").disabled = false;
  $("#ob-open").onclick = () => openProject(project.id);
}

export function deleteProject() {
  const project = workspace.projects.find(item => item.id === ob.projectId);
  if (!project || workspace.projects.length < 2) return;
  if (!window.confirm(`Delete “${project.title}” and all its sources, cards, and activity? This cannot be undone unless you have a backup.`)) return;
  workspace.projects = workspace.projects.filter(item => item.id !== project.id);
  if (workspace.activeId === project.id) workspace.activeId = projectsByRecent()[0].id;
  forgetProject(project.id).catch(error => console.error("Could not remove the project’s relationships", error));
  persist(); renderProject(); showView("projects"); toast(`${project.title} deleted.`);
}
