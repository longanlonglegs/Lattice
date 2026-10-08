// Privacy & data: local backup, restore, and delete.
import { $, toast, plural, escapeHtml } from "./util.js";
import { storageKey, workspace, setWorkspace, persist, saveNow, flushSaves, nextCardId, recordActivity, projectsByRecent } from "./state.js";
import { allStores, workspaceStores, readStores, replaceStores, clearAll, readProjectRecords, putRecords } from "./db.js";
import { isProjectBundle, migrateWorkspace, remapProjectBundle } from "./records.js";
import { openProject } from "./projects.js";

// Stores outside the workspace itself (full texts now; embeddings, edges, annotations, and versions later).
const extraStores = allStores.filter(name => !workspaceStores.includes(name));
import { showView } from "./views.js";
import { renderProject } from "./workspace.js";
import { resetPipeline } from "./pipeline.js";
import { resetWeb } from "./web/web-view.js";

export function renderPrivacy() {
  const projects = workspace.projects.length;
  const sources = workspace.projects.reduce((total, project) => total + project.sources.length, 0);
  const cards = workspace.projects.reduce((total, project) => total + project.cards.length, 0);
  $("#local-data-summary").textContent = `${plural(projects, "project")}, ${plural(sources, "source")}, and ${plural(cards, "research card")} are stored only in this browser profile.`;
  const select = $("#export-project-select");
  const previous = select.value;
  select.innerHTML = projectsByRecent().map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`).join("");
  if (workspace.projects.some(project => project.id === previous)) select.value = previous;
}

const download = (data, name) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  link.download = name;
  link.click(); URL.revokeObjectURL(link.href);
};

// One project, with the full texts of its sources and the relations Lattice found.
export async function exportProject() {
  await flushSaves();
  const project = workspace.projects.find(item => item.id === $("#export-project-select").value);
  if (!project) return;
  const sourceIds = new Set(project.sources.map(source => source.id));
  const { texts } = await readStores(["texts"]);
  const [embeddings, edges] = await Promise.all([readProjectRecords("embeddings", project.id), readProjectRecords("edges", project.id)]);
  const bundle = { app: "Lattice", kind: "project", version: 1, exportedAt: new Date().toISOString(), project, texts: texts.filter(text => sourceIds.has(text.sourceId)), embeddings, edges };
  download(bundle, `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lattice-project"}.lattice.json`);
  toast(`${project.title} exported.`);
}

export async function importProject(file) {
  if (!file) return;
  try {
    const bundle = JSON.parse(await file.text());
    if (!isProjectBundle(bundle)) throw new Error("not a project file");
    const copy = remapProjectBundle(bundle, { projectId: crypto.randomUUID(), sourceId: () => crypto.randomUUID(), cardId: nextCardId });
    const project = migrateWorkspace({ projects: [copy.project] }).projects[0]; // older card shapes, if any
    if (workspace.projects.some(item => item.title === project.title)) project.title = `${project.title} (imported)`;
    // Texts, embeddings, and relations go in first, so the pipeline finds them and makes no new AI calls.
    await Promise.all([putRecords("texts", copy.texts), putRecords("embeddings", copy.embeddings), putRecords("edges", copy.edges)]);
    workspace.projects.unshift(project);
    recordActivity("setup", "Imported this project from a file", file.name, project);
    persist(); renderPrivacy();
    openProject(project.id);
    toast(`${project.title} imported.`);
  } catch {
    toast("That file is not a Lattice project export.");
  }
  $("#import-project-input").value = "";
}
export async function downloadBackup() {
  await flushSaves();
  const backup = { app: "Lattice", version: 2, exportedAt: new Date().toISOString(), workspace, stores: await readStores(extraStores) };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  link.download = `lattice-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); URL.revokeObjectURL(link.href);
  toast("Local backup downloaded.");
}
export async function restoreBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const restored = backup?.workspace;
    if (!restored || !Array.isArray(restored.projects) || !restored.projects.every(project => typeof project.id === "string" && typeof project.title === "string" && Array.isArray(project.cards) && Array.isArray(project.sources))) throw new Error("Invalid backup");
    if (!window.confirm("Restore this backup? It will replace the local Lattice workspace in this browser.")) return;
    await flushSaves();
    await replaceStores(Object.fromEntries(extraStores.map(name => [name, Array.isArray(backup.stores?.[name]) ? backup.stores[name] : []])));
    setWorkspace(restored);
    resetPipeline(); resetWeb();
    await saveNow();
    renderProject(); renderPrivacy(); showView("projects"); toast("Backup restored locally.");
  } catch { toast("That file is not a valid Lattice backup."); }
  $("#restore-input").value = "";
}
export async function deleteWorkspace() {
  if (!window.confirm("Delete every local Lattice project, source, card, and activity record from this browser? This cannot be undone unless you have a backup.")) return;
  await flushSaves();
  await clearAll();
  localStorage.removeItem(storageKey);
  localStorage.removeItem("lattice-phase-zero-session");
  setWorkspace({ activeId: null, projects: [] });
  resetPipeline(); resetWeb();
  persist(); renderProject(); showView("projects"); toast("Local workspace deleted.");
}
