// Privacy & data: local backup, restore, and delete.
import { $, toast, plural } from "./util.js";
import { storageKey, defaultTitle, newProject, workspace, setWorkspace, persist, saveNow, flushSaves } from "./state.js";
import { allStores, workspaceStores, readStores, replaceStores, clearAll } from "./db.js";

// Stores outside the workspace itself (full texts now; embeddings, edges, annotations, and versions later).
const extraStores = allStores.filter(name => !workspaceStores.includes(name));
import { showView } from "./views.js";
import { renderProject } from "./workspace.js";
import { openOnboarding } from "./onboarding.js";
import { resetPipeline } from "./pipeline.js";
import { resetWeb } from "./web/web-view.js";

export function renderPrivacy() {
  const projects = workspace.projects.length;
  const sources = workspace.projects.reduce((total, project) => total + project.sources.length, 0);
  const cards = workspace.projects.reduce((total, project) => total + project.cards.length, 0);
  $("#local-data-summary").textContent = `${plural(projects, "project")}, ${plural(sources, "source")}, and ${plural(cards, "research card")} are stored only in this browser profile.`;
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
    if (!restored?.activeId || !Array.isArray(restored.projects) || !restored.projects.length || !restored.projects.every(project => typeof project.id === "string" && typeof project.title === "string" && Array.isArray(project.cards) && Array.isArray(project.sources))) throw new Error("Invalid backup");
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
  const project = newProject(defaultTitle, { placeholder: true });
  setWorkspace({ activeId: project.id, projects: [project] });
  resetPipeline(); resetWeb();
  persist(); renderProject(); renderPrivacy(); toast("Local workspace deleted.");
  openOnboarding("create");
}
