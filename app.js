const storageKey = "lattice-local-workspace-v1";
const $ = (selector) => document.querySelector(selector);
const defaultCards = [
  card(1, "Core concept", "What does layer normalization normalize, and where is the normalization applied?", "It normalizes the summed inputs to the neurons within a layer for a single training case, before the nonlinearity is applied.", "We compute the mean and variance used for normalization from all of the summed inputs to the neurons in a layer on a single training case.", "p. 1 · Introduction"),
  card(2, "Why it matters", "Why is layer normalization especially useful for recurrent neural networks?", "Its statistics do not depend on the minibatch, so it can be applied consistently at each time step and to variable-length sequences.", "Unlike batch normalization, layer normalization does not impose any constraint on the size of a minibatch and can be directly applied to recurrent neural networks.", "p. 2 · Recurrent neural networks"),
  card(3, "Compare", "How does layer normalization differ from batch normalization?", "Batch normalization uses statistics across examples in a minibatch; layer normalization uses statistics across features within one example.", "Layer normalization computes the normalization statistics over all the hidden units in the same layer.", "p. 3 · Layer normalization")
];

function card(id, tag, question, answer, quote, page, sourceId = "") {
  return { id, tag, question, answer, quote, page, sourceId, state: "pending", stance: "" };
}
function newProject(title = "Untitled research session") {
  return { id: crypto.randomUUID(), title, question: "", hypothesis: "", cards: structuredClone(defaultCards), sources: [], activities: [], aiAnalysis: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
function loadWorkspace() {
  let saved = null;
  let legacy = null;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { localStorage.removeItem(storageKey); }
  if (saved?.projects?.length) return saved;
  try { legacy = JSON.parse(localStorage.getItem("lattice-phase-zero-session") || "null"); } catch { localStorage.removeItem("lattice-phase-zero-session"); }
  const project = newProject();
  if (legacy) { project.question = legacy.question || ""; project.cards = legacy.cards?.length ? legacy.cards : project.cards; }
  return { activeId: project.id, projects: [project] };
}

let workspace = loadWorkspace();
let activeTab = "link";
const currentProject = () => {
  let project = workspace.projects.find(item => item.id === workspace.activeId);
  if (!project) { project = workspace.projects[0] || newProject(); workspace.projects = workspace.projects.length ? workspace.projects : [project]; workspace.activeId = project.id; }
  project.cards = Array.isArray(project.cards) && project.cards.length ? project.cards : structuredClone(defaultCards);
  project.sources = Array.isArray(project.sources) ? project.sources : [];
  project.activities = Array.isArray(project.activities) ? project.activities : [];
  project.hypothesis = typeof project.hypothesis === "string" ? project.hypothesis : "";
  project.aiAnalysis = project.aiAnalysis && typeof project.aiAnalysis === "object" ? project.aiAnalysis : null;
  return project;
};

function saveWorkspace() {
  const project = currentProject();
  project.title = $("#project-title").value.trim() || "Untitled research session";
  project.question = $("#research-question").value.trim();
  project.hypothesis = $("#working-hypothesis").value.trim();
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(storageKey, JSON.stringify(workspace));
  $("#save-status").textContent = "Saved locally";
  renderProjectPicker();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 3500);
}
function renderProjectPicker() {
  $("#project-picker").innerHTML = workspace.projects.map(project => `<option value="${project.id}">${escapeHtml(project.title)}</option>`).join("");
  $("#project-picker").value = workspace.activeId;
}
function renderSourceList() {
  const sources = currentProject().sources;
  $("#source-count").textContent = `${sources.length} source${sources.length === 1 ? "" : "s"}`;
  $("#source-list").innerHTML = sources.length ? sources.slice(-3).reverse().map(source => `
    <div class="source-chip"><span>${source.kind === "pdf" ? "PDF" : source.kind === "text" ? "TXT" : source.kind === "web" ? "WEB" : "URL"}</span><div><strong>${escapeHtml(source.title)}</strong><small>${source.detail || "Saved locally"}</small></div><button data-remove-source="${source.id}" type="button" aria-label="Remove ${escapeHtml(source.title)}">×</button></div>`).join("") : "";
  $("#source-list").querySelectorAll("[data-remove-source]").forEach(button => button.addEventListener("click", () => {
    currentProject().sources = currentProject().sources.filter(source => source.id !== button.dataset.removeSource);
    clearAiAnalysis();
    saveWorkspace(); renderSourceList(); toast("Source removed from this project.");
  }));
}
function recordActivity(type, text, detail = "") {
  currentProject().activities.unshift({ id: crypto.randomUUID(), type, text, detail, createdAt: new Date().toISOString() });
  currentProject().activities = currentProject().activities.slice(0, 30);
}
function relativeTime(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function renderActivityList() {
  const activities = currentProject().activities;
  $("#activity-list").innerHTML = activities.length ? activities.slice(0, 5).map(activity => `
    <li><span class="activity-icon ${activity.type}">${activity.type === "capture" ? "↗" : activity.type === "decision" ? "✓" : "＋"}</span><div><strong>${escapeHtml(activity.text)}</strong><small>${escapeHtml(activity.detail)} · ${relativeTime(activity.createdAt)}</small></div></li>`).join("") : `
    <li class="empty-activity"><span class="activity-icon">○</span><div><strong>Your research trail will appear here.</strong><small>Import a source or capture a web passage to get started.</small></div></li>`;
}
function renderInsights() {
  const project = currentProject();
  const cards = project.cards;
  const support = cards.filter(item => item.stance === "supports").length;
  const contradiction = cards.filter(item => item.stance === "contradicts").length;
  const questions = cards.filter(item => item.stance === "question").length;
  const anchored = cards.filter(item => item.quote?.trim() && item.page?.trim()).length;
  const untriaged = cards.length - support - contradiction - questions;
  $("#evidence-stats").innerHTML = `
    <div class="evidence-stat supports"><strong>${support}</strong><span>supports</span></div>
    <div class="evidence-stat contradicts"><strong>${contradiction}</strong><span>contradicts</span></div>
    <div class="evidence-stat questions"><strong>${questions}</strong><span>open questions</span></div>
    <div class="evidence-stat anchors"><strong>${anchored}/${cards.length}</strong><span>claims anchored</span></div>`;
  const actions = [];
  if (!project.question.trim()) actions.push(["Frame the research question", "A question makes it possible to judge whether evidence is relevant.", ".research-brief"]);
  if (!project.hypothesis.trim()) actions.push(["Write a working hypothesis", "State what you expect so contradictions become visible instead of surprising.", ".research-brief"]);
  if (!project.sources.length) actions.push(["Add your first source", "Import a local paper or capture a passage from the web.", ".ingest-card"]);
  if (untriaged) actions.push([`Classify ${untriaged} untriaged passage${untriaged === 1 ? "" : "s"}`, "Mark each as support, contradiction, or a question before drawing a conclusion.", ".results-section"]);
  if (contradiction) actions.push([`Resolve ${contradiction} contradiction${contradiction === 1 ? "" : "s"}`, "Compare the source definitions, populations, or methods before deciding which evidence applies.", ".results-section"]);
  if (support && !contradiction) actions.push(["Look for disconfirming evidence", "Your current record has support but no saved challenge to the working view.", ".ingest-card"]);
  if (!actions.length) actions.push(["Review the evidence balance", "Your saved claims are classified. Revisit the source anchors before changing your working hypothesis.", ".insights-section"]);
  $("#next-actions").innerHTML = actions.slice(0, 3).map((action, index) => `<button class="next-action" type="button" data-next-action="${index}"><span>${index + 1}</span><div><strong>${action[0]}</strong><small>${action[1]}</small></div><i>→</i></button>`).join("");
  $("#next-actions").querySelectorAll("[data-next-action]").forEach(button => button.addEventListener("click", () => {
    document.querySelector(actions[+button.dataset.nextAction][2]).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  renderAiAnalysis();
}
function evidenceForAi() {
  const project = currentProject();
  const sourceById = new Map(project.sources.map(source => [source.id, source]));
  return project.cards
    .filter(item => {
      const source = sourceById.get(item.sourceId);
      return source && source.kind !== "url" && item.quote?.trim() && item.page?.trim();
    })
    .slice(0, 12)
    .map(item => ({ id: String(item.id), quote: item.quote.trim().slice(0, 4000), page: item.page.trim().slice(0, 250), stance: item.stance || "unclassified" }));
}
function renderAiAnalysis() {
  const project = currentProject();
  const evidence = evidenceForAi();
  const result = project.aiAnalysis;
  const status = $("#ai-status");
  const results = $("#ai-results");
  if (!result) {
    status.textContent = evidence.length ? `${evidence.length} source-grounded passage${evidence.length === 1 ? "" : "s"} are ready. Analysis stays off until you opt in.` : "Add a pasted, PDF, or browser-captured passage to make source-grounded analysis available.";
    results.classList.add("hidden"); results.innerHTML = "";
    return;
  }
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const sourceLabels = ids => (ids || []).map(id => evidenceById.get(String(id))?.page || `Evidence ${id}`).join(" · ");
  status.textContent = `Last analysis: ${relativeTime(result.generatedAt)} · ${result.evidenceCount} source-grounded passage${result.evidenceCount === 1 ? "" : "s"} · ${result.confidence || "unknown"} confidence`;
  results.classList.remove("hidden");
  results.innerHTML = `
    <div class="ai-summary"><span>AI EVIDENCE READ</span><p>${escapeHtml(result.summary || "No summary returned.")}</p></div>
    <div class="ai-detail-grid">
      <div><p class="ai-result-label">TENSIONS TO CHECK</p>${(result.tensions || []).length ? `<ol class="ai-tensions">${result.tensions.map(item => `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.explanation)}</p><small>${escapeHtml(sourceLabels(item.evidence_ids))}</small></li>`).join("")}</ol>` : `<p class="ai-empty">No specific tension surfaced from these passages.</p>`}</div>
      <div><p class="ai-result-label">NEXT RESEARCH MOVES</p>${(result.next_actions || []).length ? `<ol class="ai-actions">${result.next_actions.map(item => `<li><span class="priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.reason)}</p></div></li>`).join("")}</ol>` : `<p class="ai-empty">No next action returned.</p>`}</div>
    </div>`;
}
function clearAiAnalysis() {
  currentProject().aiAnalysis = null;
}
async function analyzeEvidence() {
  const project = currentProject();
  const evidence = evidenceForAi();
  if (!$("#ai-consent").checked) return toast("Confirm the one-time data sharing choice first.");
  if (!project.question.trim()) return toast("Add a research question before asking for an evidence analysis.");
  if (!evidence.length) return toast("Add a pasted, PDF, or browser-captured passage first. Saved links alone are not sent to AI.");
  const requestSignature = JSON.stringify({ question: project.question, hypothesis: project.hypothesis, evidence });
  const button = $("#ai-analyze-button");
  button.disabled = true; button.textContent = "Analyzing evidence…";
  try {
    const response = await fetch("/api/evidence-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: project.question, hypothesis: project.hypothesis, evidence }) });
    const payload = await response.json();
    if (!response.ok || !payload.analysis) throw new Error(payload.error || "The analysis could not be completed.");
    const currentSignature = JSON.stringify({ question: currentProject().question, hypothesis: currentProject().hypothesis, evidence: evidenceForAi() });
    if (currentSignature !== requestSignature) {
      toast("The evidence changed while the analysis was running, so its result was not saved.");
      return;
    }
    project.aiAnalysis = { ...payload.analysis, generatedAt: new Date().toISOString(), evidenceCount: evidence.length };
    recordActivity("analysis", "Ran an AI evidence analysis", `${evidence.length} source-grounded passage${evidence.length === 1 ? "" : "s"}`);
    saveWorkspace(); renderActivityList(); renderInsights(); toast("Source-grounded evidence analysis is ready.");
  } catch (error) {
    toast(error.message || "The analysis could not be completed.");
  } finally {
    button.disabled = !$("#ai-consent").checked;
    button.innerHTML = "Analyze evidence <span>→</span>";
  }
}
function renderProject() {
  const project = currentProject();
  $("#project-title").value = project.title;
  $("#research-question").value = project.question;
  $("#working-hypothesis").value = project.hypothesis;
  $("#card-count").textContent = project.cards.length;
  renderProjectPicker(); renderSourceList(); renderActivityList(); renderInsights(); renderCards(); updateProgress(); renderCardsLibrary(); renderSourceLibrary();
}
function sourceKind(source) {
  return source.kind === "pdf" ? "PDF" : source.kind === "text" ? "Pasted text" : source.kind === "web" ? "Web capture" : "Saved link";
}
function sourceHref(source) {
  const candidate = String(source.originalUrl || (source.kind === "web" ? source.detail : source.title) || "").trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^10\.\d{4,9}\//.test(candidate)) return `https://doi.org/${candidate}`;
  if (source.kind === "url" && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(candidate)) return `https://${candidate}`;
  return "";
}
function sourceOrigin(source) {
  const href = sourceHref(source);
  if (!href) return source.detail || "Saved locally";
  try {
    const url = new URL(href);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`;
  } catch { return source.detail || "Saved locally"; }
}
function allSources(projectId = "all") {
  return workspace.projects
    .filter(project => projectId === "all" || project.id === projectId)
    .flatMap(project => project.sources.map(source => ({ ...source, projectId: project.id, projectTitle: project.title, passages: project.cards.filter(card => card.sourceId === source.id).length })));
}
function renderSourceLibrary() {
  const filter = $("#source-library-project-filter");
  const previous = filter.value || "all";
  filter.innerHTML = `<option value="all">All projects</option>${workspace.projects.map(project => `<option value="${project.id}">${escapeHtml(project.title)}</option>`).join("")}`;
  filter.value = workspace.projects.some(project => project.id === previous) || previous === "all" ? previous : "all";
  const query = $("#source-library-search").value.trim().toLowerCase();
  const sources = allSources(filter.value).filter(source => [source.title, source.detail, source.capturedText].some(value => String(value || "").toLowerCase().includes(query)));
  const total = allSources().length;
  $("#library-nav-count").textContent = total;
  $("#library-summary").textContent = `${total} saved source${total === 1 ? "" : "s"}`;
  $("#source-library-list").innerHTML = sources.length ? sources.map(source => {
    const href = sourceHref(source);
    const preview = source.capturedText ? `<p class="source-preview">${escapeHtml(source.capturedText.slice(0, 260))}${source.capturedText.length > 260 ? "…" : ""}</p>` : "";
    return `<article class="library-source"><div class="library-source-kind">${sourceKind(source)}</div><div class="library-source-main"><div class="library-source-meta"><span>${escapeHtml(source.projectTitle)}</span><small>${source.passages} passage${source.passages === 1 ? "" : "s"} extracted</small></div><h2>${escapeHtml(source.title)}</h2><p class="library-source-origin">${escapeHtml(sourceOrigin(source))}</p>${preview}</div><div class="library-source-actions">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}<button type="button" data-open-source-project="${source.projectId}">Open project</button></div></article>`;
  }).join("") : `<div class="empty-sources"><strong>${query ? "No sources match that search." : "Your source library is empty."}</strong><p>${query ? "Try a different title, URL, or phrase from a capture." : "Add a link, PDF, pasted text, or web capture in Workspace to keep it here."}</p></div>`;
  $("#source-library-list").querySelectorAll("[data-open-source-project]").forEach(button => button.addEventListener("click", () => {
    workspace.activeId = button.dataset.openSourceProject;
    renderProject(); showView("workspace");
    document.querySelector(".ingest-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
function renderCards() {
  const cards = currentProject().cards;
  $("#cards-grid").innerHTML = cards.map((item, index) => `
    <article class="study-card ${item.state} ${item.revealed ? "revealed" : ""} ${item.editing ? "editing" : ""}" data-id="${item.id}">
      <div class="card-top"><span class="tag">${item.tag}</span><div><span class="card-index">0${index + 1}</span><button class="card-edit" data-card-edit type="button">${item.editing ? "Done" : "Edit"}</button></div></div>
      <div class="card-prompt"><p class="card-label">PROMPT</p><p class="card-question">${escapeHtml(item.question)}</p><textarea class="question" data-field="question" aria-label="Edit card question">${escapeHtml(item.question)}</textarea></div>
      <button class="reveal-button" data-card-reveal type="button"><span>${item.revealed ? "⌃" : "⌄"}</span>${item.revealed ? "Hide answer" : "Reveal answer"}</button>
      <div class="card-detail">
        <div class="answer-wrap"><p class="card-label">ANSWER</p><p class="card-answer">${escapeHtml(item.answer)}</p><textarea class="answer" data-field="answer" aria-label="Edit card answer">${escapeHtml(item.answer)}</textarea></div>
        <details class="source-anchor"><summary>View source evidence <span>${escapeHtml(item.page)}</span></summary><div><span class="quote-mark">“</span><p>${escapeHtml(item.quote)}</p></div></details>
        <div class="stance-control"><p>THIS PASSAGE…</p><div>
        <button class="stance ${item.stance === "supports" ? "selected supports" : ""}" data-stance="supports">Supports</button>
        <button class="stance ${item.stance === "contradicts" ? "selected contradicts" : ""}" data-stance="contradicts">Contradicts</button>
        <button class="stance ${item.stance === "question" ? "selected question" : ""}" data-stance="question">Raises a question</button>
        </div></div>
      </div>
      <div class="card-actions">
        <button class="reject ${item.state === "rejected" ? "chosen" : ""}" data-action="reject">${item.state === "rejected" ? "↶ Restore" : "× Reject"}</button>
        <button class="approve ${item.state === "approved" ? "chosen" : ""}" data-action="approve">${item.state === "approved" ? "✓ Saved to Cards" : "✓ Save to Cards"}</button>
      </div>
    </article>`).join("");
  $("#cards-grid").querySelectorAll("textarea").forEach(node => node.addEventListener("input", event => {
    const item = cards.find(candidate => candidate.id === +event.target.closest("article").dataset.id);
    item[event.target.dataset.field] = event.target.value; clearAiAnalysis(); saveWorkspace(); renderInsights();
  }));
  $("#cards-grid").querySelectorAll("[data-card-reveal]").forEach(button => button.addEventListener("click", () => {
    const item = cards.find(candidate => candidate.id === +button.closest("article").dataset.id);
    item.revealed = !item.revealed; saveWorkspace(); renderCards();
  }));
  $("#cards-grid").querySelectorAll("[data-card-edit]").forEach(button => button.addEventListener("click", () => {
    const item = cards.find(candidate => candidate.id === +button.closest("article").dataset.id);
    item.editing = !item.editing;
    if (item.editing) item.revealed = true;
    saveWorkspace(); renderCards();
  }));
  $("#cards-grid").querySelectorAll("[data-stance]").forEach(button => button.addEventListener("click", () => {
    const item = cards.find(candidate => candidate.id === +button.closest("article").dataset.id);
    item.stance = item.stance === button.dataset.stance ? "" : button.dataset.stance;
    if (item.stance) recordActivity("decision", `Marked a passage as ${item.stance}`, item.page);
    clearAiAnalysis(); saveWorkspace(); renderCards(); updateProgress(); renderInsights();
  }));
  $("#cards-grid").querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const item = cards.find(candidate => candidate.id === +button.closest("article").dataset.id);
    const next = button.dataset.action === "approve" ? "approved" : "rejected";
    item.state = item.state === next ? "pending" : next;
    recordActivity("decision", item.state === "pending" ? "Reopened a card" : `${item.state === "approved" ? "Approved" : "Rejected"} a card`, item.page);
    saveWorkspace(); renderCards(); updateProgress(); renderInsights();
  }));
}
function updateProgress() {
  const cards = currentProject().cards;
  const reviewed = cards.filter(item => item.state !== "pending" || item.stance).length;
  const approved = approvedCards().length;
  $("#reviewed-count").textContent = `${reviewed} of ${cards.length} reviewed`;
  $("#meter-fill").style.width = `${cards.length ? reviewed / cards.length * 100 : 0}%`;
  $("#export-button").disabled = approved === 0;
  $("#approved-summary").textContent = `${approved} approved card${approved === 1 ? "" : "s"}`;
  $("#cards-nav-count").textContent = approved;
}
function approvedCards(projectId = "all") {
  return workspace.projects.filter(project => projectId === "all" || project.id === projectId).flatMap(project => project.cards.filter(item => item.state === "approved").map(item => ({ ...item, projectId: project.id, projectTitle: project.title })));
}
function renderCardsLibrary() {
  const filter = $("#cards-project-filter");
  const previous = filter.value || "all";
  filter.innerHTML = `<option value="all">All projects</option>${workspace.projects.map(project => `<option value="${project.id}">${escapeHtml(project.title)}</option>`).join("")}`;
  filter.value = workspace.projects.some(project => project.id === previous) || previous === "all" ? previous : "all";
  const cards = approvedCards(filter.value);
  $("#approved-cards-list").innerHTML = cards.length ? cards.map(item => `
    <article class="saved-card" data-project-id="${item.projectId}" data-card-id="${item.id}"><div class="saved-meta"><span>${escapeHtml(item.projectTitle)}</span>${escapeHtml(item.page)}</div><div><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div><button type="button" data-remove-card>Remove</button></article>`).join("") : `<div class="empty-cards"><strong>Your card library is empty.</strong><p>Approve a useful card in Workspace and it will appear here.</p></div>`;
  $("#approved-cards-list").querySelectorAll("[data-remove-card]").forEach(button => button.addEventListener("click", () => {
    const item = button.closest(".saved-card");
    const project = workspace.projects.find(candidate => candidate.id === item.dataset.projectId);
    const card = project?.cards.find(candidate => candidate.id === +item.dataset.cardId);
    if (card) { card.state = "pending"; project.activities = Array.isArray(project.activities) ? project.activities : []; project.activities.unshift({ id: crypto.randomUUID(), type: "decision", text: "Removed a card from the library", detail: card.page, createdAt: new Date().toISOString() }); saveWorkspace(); renderProject(); toast("Card removed from your library."); }
  }));
}
function renderPrivacy() {
  const projects = workspace.projects.length;
  const sources = workspace.projects.reduce((total, project) => total + project.sources.length, 0);
  const cards = workspace.projects.reduce((total, project) => total + project.cards.length, 0);
  $("#local-data-summary").textContent = `${projects} project${projects === 1 ? "" : "s"}, ${sources} source${sources === 1 ? "" : "s"}, and ${cards} research card${cards === 1 ? "" : "s"} are stored only in this browser profile.`;
}
function downloadBackup() {
  const backup = { app: "Lattice", version: 1, exportedAt: new Date().toISOString(), workspace };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  link.download = `lattice-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); URL.revokeObjectURL(link.href);
  toast("Local backup downloaded.");
}
async function restoreBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const restored = backup?.workspace;
    if (!restored?.activeId || !Array.isArray(restored.projects) || !restored.projects.length || !restored.projects.every(project => typeof project.id === "string" && typeof project.title === "string" && Array.isArray(project.cards) && Array.isArray(project.sources))) throw new Error("Invalid backup");
    if (!window.confirm("Restore this backup? It will replace the local Lattice workspace in this browser.")) return;
    workspace = restored;
    localStorage.setItem(storageKey, JSON.stringify(workspace));
    renderProject(); renderPrivacy(); showView("workspace"); toast("Backup restored locally.");
  } catch { toast("That file is not a valid Lattice backup."); }
  $("#restore-input").value = "";
}
function deleteWorkspace() {
  if (!window.confirm("Delete every local Lattice project, source, card, and activity record from this browser? This cannot be undone unless you have a backup.")) return;
  localStorage.removeItem(storageKey);
  localStorage.removeItem("lattice-phase-zero-session");
  const project = newProject();
  workspace = { activeId: project.id, projects: [project] };
  saveWorkspace(); renderProject(); renderPrivacy(); showView("workspace"); toast("Local workspace deleted.");
}
function showView(view) {
  if (["workspace", "library", "cards", "privacy"].includes(view) && window.location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  $("#workspace").classList.toggle("hidden", view !== "workspace");
  $("#library-view").classList.toggle("hidden", view !== "library");
  $("#cards-view").classList.toggle("hidden", view !== "cards");
  $("#privacy-view").classList.toggle("hidden", view !== "privacy");
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  updateViewContext(view);
  if (view === "library") renderSourceLibrary();
  if (view === "cards") { renderCardsLibrary(); updateProgress(); }
  if (view === "privacy") renderPrivacy();
}
function updateViewContext(view) {
  const labels = { workspace: "Workspace", library: "Library", cards: "Cards", privacy: "Privacy & data" };
  $("#topbar-view").textContent = labels[view] || "Workspace";
  const isWorkspace = view === "workspace";
  $("#project-context").classList.toggle("hidden", !isWorkspace);
  $("#topbar-divider").classList.toggle("hidden", !isWorkspace);
  $("#topbar-status").textContent = isWorkspace ? "Saved locally" : view === "library" ? "All saved sources" : view === "cards" ? "Approved cards" : "Local controls";
}
function claimsFromText(text, sourceLabel, page = "", sourceId = "") {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g)?.filter(sentence => sentence.trim().length > 55).slice(0, 3) || [];
  return sentences.map((sentence, index) => card(Date.now() + index, ["Key finding", "Method", "Implication"][index], "What is the key takeaway from this passage?", sentence.trim(), sentence.trim(), `${page || "Source"} · ${sourceLabel}`, sourceId));
}
async function readPdf(file) {
  const pdfjsLib = await import("./node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const text = (await page.getTextContent()).items.map(item => item.str).join(" ").trim();
    if (text) pages.push({ pageNo, text });
  }
  return pages;
}
async function addLocalFile(file) {
  const project = currentProject();
  if (!file) return toast("Choose a PDF, Markdown, or text file first.");
  const source = { id: crypto.randomUUID(), title: file.name, kind: file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text", detail: `${Math.max(1, Math.round(file.size / 1024))} KB · imported locally` };
  try {
    let generated = [];
    if (source.kind === "pdf") {
      $("#upload-button").disabled = true; $("#upload-button").textContent = "Reading PDF…";
      const pages = await readPdf(file);
      generated = pages.flatMap(({ pageNo, text }) => claimsFromText(text, file.name, `p. ${pageNo}`, source.id)).slice(0, 6);
      source.detail = `${pages.length} page${pages.length === 1 ? "" : "s"} · imported locally`;
    } else {
      const text = await file.text();
      source.capturedText = text;
      generated = claimsFromText(text, file.name, "Imported text", source.id);
    }
    project.sources.push(source);
    recordActivity("import", `Imported ${source.title}`, source.detail);
    if (generated.length) project.cards = generated;
    clearAiAnalysis();
    saveWorkspace(); renderProject();
    document.querySelector(".results-section").scrollIntoView({ behavior: "smooth", block: "start" });
    toast(generated.length ? `${source.title} imported with page-aware source anchors.` : `${source.title} was saved, but no usable passages were found.`);
  } catch (error) {
    toast("Lattice could not read that file. Try a text-based PDF or Markdown file.");
  } finally {
    $("#upload-button").disabled = false; $("#upload-button").innerHTML = "Use source <span>→</span>";
  }
}
function addUrlSource() {
  const value = $("#source-input").value.trim();
  if (!value) return toast("Add a URL or DOI first.");
  const project = currentProject();
  const source = { id: crypto.randomUUID(), title: value.replace(/^https?:\/\//, ""), kind: "url", detail: "Link saved locally", originalUrl: value };
  project.sources.push(source);
  recordActivity("import", "Saved a source link", value.replace(/^https?:\/\//, ""));
  project.cards = structuredClone(defaultCards).map(item => ({ ...item, sourceId: source.id }));
  clearAiAnalysis();
  saveWorkspace(); renderProject();
  document.querySelector(".results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Source link saved. Sample cards are ready to review; local files provide direct extraction.");
}
function exportMarkdown() {
  const project = currentProject();
  const records = project.cards.filter(item => item.stance || item.state === "approved");
  const body = ["# " + project.title, "", "## Research question", project.question || "Untitled research question", "", "## Working hypothesis", project.hypothesis || "Not yet stated", "", "## Sources", ...project.sources.map(source => `- ${source.title} — ${source.detail}`), "", "## Claims and evidence", "", ...(records.length ? records : project.cards).flatMap(item => [`### ${item.stance || "untriaged"}: ${item.question}`, "", item.answer, "", `> ${item.quote}`, "", `Source: ${item.page}`, ""])].join("\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([body], { type: "text/markdown" })); link.download = `${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lattice-project"}.md`; link.click(); URL.revokeObjectURL(link.href);
  toast("Project exported as Markdown.");
}
function receiveBrowserCapture(payload) {
  const selection = String(payload?.selection || "").trim();
  const url = String(payload?.url || "").trim();
  if (!selection || !url) return;
  const project = currentProject();
  const title = String(payload?.title || new URL(url).hostname).trim();
  const source = { id: crypto.randomUUID(), title, kind: "web", detail: url, originalUrl: url, capturedText: selection };
  project.sources.push(source);
  const generated = claimsFromText(selection, title, "Web capture", source.id);
  if (generated.length) project.cards = generated;
  clearAiAnalysis();
  recordActivity("capture", `Captured a passage from ${title}`, url);
  saveWorkspace(); renderProject();
  document.querySelector(".results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Web passage captured in this project.");
}

document.querySelectorAll(".source-tab").forEach(tab => tab.addEventListener("click", () => {
  activeTab = tab.dataset.tab; document.querySelectorAll(".source-tab").forEach(item => item.classList.toggle("selected", item === tab));
  ["link", "upload", "text"].forEach(name => $("#" + name + "-panel").classList.toggle("hidden", name !== activeTab));
}));
window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.data?.type !== "LATTICE_EXTENSION_CAPTURE") return;
  receiveBrowserCapture(event.data.payload);
});
$("#project-picker").addEventListener("change", event => { workspace.activeId = event.target.value; renderProject(); });
$("#new-project").addEventListener("click", () => { const project = newProject("New research project"); workspace.projects.unshift(project); workspace.activeId = project.id; saveWorkspace(); renderProject(); $("#project-title").focus(); $("#project-title").select(); });
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$("#brand-home").addEventListener("click", event => { event.preventDefault(); showView("workspace"); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("#how-it-works").addEventListener("click", () => { showView("workspace"); document.querySelector(".research-brief").scrollIntoView({ behavior: "smooth", block: "start" }); });
$("#continue-to-judgment").addEventListener("click", () => document.querySelector(".insights-section").scrollIntoView({ behavior: "smooth", block: "start" }));
$("#cards-project-filter").addEventListener("change", renderCardsLibrary);
$("#source-library-project-filter").addEventListener("change", renderSourceLibrary);
$("#source-library-search").addEventListener("input", renderSourceLibrary);
$("#backup-button").addEventListener("click", downloadBackup);
$("#restore-input").addEventListener("change", event => restoreBackup(event.target.files[0]));
$("#delete-workspace").addEventListener("click", deleteWorkspace);
["#project-title", "#research-question", "#working-hypothesis"].forEach(selector => $(selector).addEventListener("input", () => { $("#save-status").textContent = "Saving…"; clearAiAnalysis(); saveWorkspace(); renderInsights(); }));
$("#ai-consent").addEventListener("change", event => { $("#ai-analyze-button").disabled = !event.target.checked; });
$("#ai-analyze-button").addEventListener("click", analyzeEvidence);
$("#markdown-export").addEventListener("click", exportMarkdown);
$("#analyze-button").addEventListener("click", addUrlSource);
$("#upload-button").addEventListener("click", () => addLocalFile($("#file-input").files[0]));
$("#text-button").addEventListener("click", () => {
  const text = $("#source-text").value.trim(); if (!text) return toast("Paste text first.");
  const project = currentProject(); const source = { id: crypto.randomUUID(), title: "Pasted text", kind: "text", detail: "Imported locally", capturedText: text };
  project.sources.push(source); recordActivity("import", "Added pasted text", "Imported locally"); project.cards = claimsFromText(text, source.title, "Pasted text", source.id); clearAiAnalysis(); saveWorkspace(); renderProject(); toast("Pasted text added to this project.");
});
$("#export-button").addEventListener("click", async () => {
  const approved = approvedCards($("#cards-project-filter").value);
  try {
    const response = await fetch("http://127.0.0.1:8765", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addNotes", version: 6, params: { notes: approved.map(item => ({ deckName: "Lattice", modelName: "Basic", fields: { Front: item.question, Back: `${item.answer}<br><br><small>Source: ${item.page}</small>` }, tags: ["lattice", "grounded"] })) } }) });
    if (!response.ok) throw new Error(); toast(`${approved.length} card${approved.length === 1 ? "" : "s"} exported to Anki.`);
  } catch { toast("AnkiConnect isn’t running. Your approved cards are still saved locally."); }
});

renderProject();
showView(["#workspace", "#library", "#cards", "#privacy"].includes(window.location.hash) ? window.location.hash.slice(1) : "workspace");
