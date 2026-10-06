// The workspace (all projects), its storage in IndexedDB, and project-level helpers.
import { $, toast } from "./util.js";
import { renderProjectNav } from "./projects.js";
import { readStores, saveWorkspaceRecords, workspaceStores } from "./db.js";
import { joinWorkspace, migrateWorkspace, splitWorkspace } from "./records.js";
import { originOf } from "./origins.js";

export const storageKey = "lattice-local-workspace-v1";
export const defaultTitle = "Untitled project";
export const projectColours = { terracotta: "#d95d39", amber: "#c98a2e", olive: "#7d8c34", sage: "#3f7a63", teal: "#2f7f8a", blue: "#4b6ca6", plum: "#85579a", rose: "#bf5577" };
export const colourKeys = Object.keys(projectColours);
let cardSeq = Date.now() * 100;
export const nextCardId = () => ++cardSeq;

export function card(id, claim, quote, location, sourceId = "", origin = "external") {
  return { id, claim, quote, location, sourceId, origin, state: "pending", note: "" };
}
export function newProject(title = defaultTitle, fields = {}) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title, colour: "sage", question: "", hypothesis: "", cards: [], sources: [], activities: [], versions: [], aiAnalysis: null, createdAt: now, updatedAt: now, ...fields };
}
// Loads from IndexedDB. The first time, it copies the old localStorage workspace over;
// that key is left in place as a backup until the next version.
async function loadWorkspace() {
  const stored = await readStores(workspaceStores);
  if (stored.projects.length) return { workspace: joinWorkspace(stored), fresh: false };
  let saved = null;
  let legacy = null;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { /* unreadable: ignore */ }
  if (saved?.projects?.length) return { workspace: saved, fresh: false, migrated: true };
  try { legacy = JSON.parse(localStorage.getItem("lattice-phase-zero-session") || "null"); } catch { localStorage.removeItem("lattice-phase-zero-session"); }
  const project = newProject(defaultTitle, { placeholder: true });
  if (legacy) { project.question = legacy.question || ""; project.cards = legacy.cards?.length ? legacy.cards : []; project.placeholder = false; }
  return { workspace: { activeId: project.id, projects: [project] }, fresh: !legacy };
}

export let loaded = null;
export let workspace = null;
export function setWorkspace(next) { workspace = migrateWorkspace(next); }
export async function initWorkspace() {
  loaded = await loadWorkspace();
  setWorkspace(loaded.workspace);
  if (loaded.migrated) await saveNow();
}

export function normalizeProject(project) {
  project.cards = Array.isArray(project.cards) ? project.cards : [];
  project.sources = Array.isArray(project.sources) ? project.sources : [];
  project.activities = Array.isArray(project.activities) ? project.activities : [];
  project.versions = Array.isArray(project.versions) ? project.versions : [];
  project.question = typeof project.question === "string" ? project.question : "";
  project.hypothesis = typeof project.hypothesis === "string" ? project.hypothesis : "";
  project.colour = projectColours[project.colour] ? project.colour : "sage";
  project.updatedAt = project.updatedAt || project.createdAt || new Date().toISOString();
  project.aiAnalysis = project.aiAnalysis && typeof project.aiAnalysis === "object" ? project.aiAnalysis : null;
  project.webLayout = project.webLayout && typeof project.webLayout === "object" ? project.webLayout : {};
  return project;
}
export const currentProject = () => {
  let project = workspace.projects.find(item => item.id === workspace.activeId);
  if (!project) { project = workspace.projects[0] || newProject(); workspace.projects = workspace.projects.length ? workspace.projects : [project]; workspace.activeId = project.id; }
  return normalizeProject(project);
};
export const projectsByRecent = () => workspace.projects.map(normalizeProject).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
export const isPristinePlaceholder = project => project.placeholder && project.title === defaultTitle && !project.question && !project.hypothesis && !project.sources?.length && !project.cards?.length;

// Saves run one at a time; changes made during a save are written by one more save after it.
let saving = null;
let saveAgain = false;
function storageError(error) {
  console.error(error);
  toast(error?.name === "QuotaExceededError"
    ? "Lattice ran out of browser storage, so your latest change wasn't saved. Free up disk space or remove large sources, then try again."
    : "Lattice couldn't save your latest change to browser storage. Download a backup from Privacy & data to be safe.");
}
export function saveNow() {
  if (saving) { saveAgain = true; return saving; }
  saving = saveWorkspaceRecords(splitWorkspace(workspace)).catch(storageError).finally(() => {
    saving = null;
    if (saveAgain) { saveAgain = false; saveNow(); }
  });
  return saving;
}
// Resolves once everything changed so far is on disk.
export async function flushSaves() {
  while (saving) await saving;
}
export function persist() {
  saveNow();
  renderProjectNav();
}
export function saveWorkspace() {
  const project = currentProject();
  project.title = $("#project-title").value.trim() || defaultTitle;
  project.question = $("#research-question").value.trim();
  project.hypothesis = $("#working-hypothesis").value.trim();
  project.updatedAt = new Date().toISOString();
  persist();
  $("#save-status").textContent = "Saved locally";
}
export const sourceCode = source => ({ pdf: "PDF", text: "TXT", web: "WEB", work: "YOU", hypothesis: "HYP" }[source.kind] || "URL");
export function sourceKind(source) {
  if (source.origin && source.origin !== "external") return originOf(source.origin).label;
  return { pdf: "PDF", text: "Pasted text", web: "Web capture" }[source.kind] || "Saved link";
}
export const isOwnWork = source => Boolean(source.origin && source.origin !== "external");
export function recordActivity(type, text, detail = "", project = currentProject()) {
  project.activities.unshift({ id: crypto.randomUUID(), type, text, detail, createdAt: new Date().toISOString() });
  project.activities = project.activities.slice(0, 30);
}
export function clearAiAnalysis() {
  currentProject().aiAnalysis = null;
}
