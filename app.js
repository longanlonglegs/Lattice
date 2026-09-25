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
  return { id: crypto.randomUUID(), title, question: "", hypothesis: "", cards: structuredClone(defaultCards), sources: [], activities: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
    <div class="source-chip"><span>${source.kind === "pdf" ? "PDF" : source.kind === "text" ? "TXT" : "URL"}</span><div><strong>${escapeHtml(source.title)}</strong><small>${source.detail || "Saved locally"}</small></div><button data-remove-source="${source.id}" type="button" aria-label="Remove ${escapeHtml(source.title)}">×</button></div>`).join("") : "";
  $("#source-list").querySelectorAll("[data-remove-source]").forEach(button => button.addEventListener("click", () => {
    currentProject().sources = currentProject().sources.filter(source => source.id !== button.dataset.removeSource);
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
  if (!project.question.trim()) actions.push(["Frame the research question", "A question makes it possible to judge whether evidence is relevant."]);
  if (!project.hypothesis.trim()) actions.push(["Write a working hypothesis", "State what you expect so contradictions become visible instead of surprising."]);
  if (!project.sources.length) actions.push(["Add your first source", "Import a local paper or capture a passage from the web."]);
  if (untriaged) actions.push([`Classify ${untriaged} untriaged passage${untriaged === 1 ? "" : "s"}`, "Mark each as support, contradiction, or a question before drawing a conclusion."]);
  if (contradiction) actions.push([`Resolve ${contradiction} contradiction${contradiction === 1 ? "" : "s"}`, "Compare the source definitions, populations, or methods before deciding which evidence applies."]);
  if (support && !contradiction) actions.push(["Look for disconfirming evidence", "Your current record has support but no saved challenge to the working view."]);
  if (!actions.length) actions.push(["Review the evidence balance", "Your saved claims are classified. Revisit the source anchors before changing your working hypothesis."]);
  $("#next-actions").innerHTML = actions.slice(0, 3).map((action, index) => `<button class="next-action" type="button" data-next-action="${index}"><span>${index + 1}</span><div><strong>${action[0]}</strong><small>${action[1]}</small></div><i>→</i></button>`).join("");
  $("#next-actions").querySelectorAll("[data-next-action]").forEach(button => button.addEventListener("click", () => {
    const needsBrief = !project.question.trim() || !project.hypothesis.trim();
    document.querySelector(needsBrief ? ".research-brief" : ".results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
function renderProject() {
  const project = currentProject();
  $("#project-title").value = project.title;
  $("#research-question").value = project.question;
  $("#working-hypothesis").value = project.hypothesis;
  $("#card-count").textContent = project.cards.length;
  renderProjectPicker(); renderSourceList(); renderActivityList(); renderInsights(); renderCards(); updateProgress(); renderCardsLibrary();
}
function renderCards() {
  const cards = currentProject().cards;
  $("#cards-grid").innerHTML = cards.map((item, index) => `
    <article class="study-card ${item.state}" data-id="${item.id}">
      <div class="card-top"><span class="tag">${item.tag}</span><span class="card-index">0${index + 1}</span></div>
      <p class="card-label">FRONT</p><textarea class="question" data-field="question" aria-label="Card question">${escapeHtml(item.question)}</textarea>
      <div class="answer-wrap"><p class="card-label">BACK</p><textarea class="answer" data-field="answer" aria-label="Card answer">${escapeHtml(item.answer)}</textarea></div>
      <div class="source-anchor"><span class="quote-mark">“</span><p>${escapeHtml(item.quote)}</p><button class="source-link" type="button">${escapeHtml(item.page)} ↗</button></div>
      <div class="stance-control"><p>THIS PASSAGE…</p><div>
        <button class="stance ${item.stance === "supports" ? "selected supports" : ""}" data-stance="supports">Supports</button>
        <button class="stance ${item.stance === "contradicts" ? "selected contradicts" : ""}" data-stance="contradicts">Contradicts</button>
        <button class="stance ${item.stance === "question" ? "selected question" : ""}" data-stance="question">Raises a question</button>
      </div></div>
      <div class="card-actions">
        <button class="reject ${item.state === "rejected" ? "chosen" : ""}" data-action="reject">${item.state === "rejected" ? "↶ Restore" : "× Reject"}</button>
        <button class="approve ${item.state === "approved" ? "chosen" : ""}" data-action="approve">${item.state === "approved" ? "✓ Saved to Cards" : "✓ Save to Cards"}</button>
      </div>
    </article>`).join("");
  $("#cards-grid").querySelectorAll("textarea").forEach(node => node.addEventListener("input", event => {
    const item = cards.find(candidate => candidate.id === +event.target.closest("article").dataset.id);
    item[event.target.dataset.field] = event.target.value; saveWorkspace();
  }));
  $("#cards-grid").querySelectorAll("[data-stance]").forEach(button => button.addEventListener("click", () => {
    const item = cards.find(candidate => candidate.id === +button.closest("article").dataset.id);
    item.stance = item.stance === button.dataset.stance ? "" : button.dataset.stance;
    if (item.stance) recordActivity("decision", `Marked a passage as ${item.stance}`, item.page);
    saveWorkspace(); renderCards(); updateProgress(); renderInsights();
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
function showView(view) {
  const cardsView = view === "cards";
  $("#workspace").classList.toggle("hidden", cardsView);
  $("#cards-view").classList.toggle("hidden", !cardsView);
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  if (cardsView) { renderCardsLibrary(); updateProgress(); }
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
  const source = { id: crypto.randomUUID(), title: value.replace(/^https?:\/\//, ""), kind: "url", detail: "Link saved locally" };
  project.sources.push(source);
  recordActivity("import", "Saved a source link", value.replace(/^https?:\/\//, ""));
  project.cards = structuredClone(defaultCards).map(item => ({ ...item, sourceId: source.id }));
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
  const source = { id: crypto.randomUUID(), title, kind: "web", detail: url, capturedText: selection };
  project.sources.push(source);
  const generated = claimsFromText(selection, title, "Web capture", source.id);
  if (generated.length) project.cards = generated;
  recordActivity("capture", `Captured a passage from ${title}`, url);
  saveWorkspace(); renderProject();
  document.querySelector(".memory-section").scrollIntoView({ behavior: "smooth", block: "start" });
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
$("#cards-project-filter").addEventListener("change", renderCardsLibrary);
["#project-title", "#research-question", "#working-hypothesis"].forEach(selector => $(selector).addEventListener("input", () => { $("#save-status").textContent = "Saving…"; saveWorkspace(); renderInsights(); }));
$("#markdown-export").addEventListener("click", exportMarkdown);
$("#analyze-button").addEventListener("click", addUrlSource);
$("#upload-button").addEventListener("click", () => addLocalFile($("#file-input").files[0]));
$("#text-button").addEventListener("click", () => {
  const text = $("#source-text").value.trim(); if (!text) return toast("Paste text first.");
  const project = currentProject(); const source = { id: crypto.randomUUID(), title: "Pasted text", kind: "text", detail: "Imported locally", capturedText: text };
  project.sources.push(source); recordActivity("import", "Added pasted text", "Imported locally"); project.cards = claimsFromText(text, source.title, "Pasted text", source.id); saveWorkspace(); renderProject(); toast("Pasted text added to this project.");
});
$("#export-button").addEventListener("click", async () => {
  const approved = approvedCards($("#cards-project-filter").value);
  try {
    const response = await fetch("http://127.0.0.1:8765", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addNotes", version: 6, params: { notes: approved.map(item => ({ deckName: "Lattice", modelName: "Basic", fields: { Front: item.question, Back: `${item.answer}<br><br><small>Source: ${item.page}</small>` }, tags: ["lattice", "grounded"] })) } }) });
    if (!response.ok) throw new Error(); toast(`${approved.length} card${approved.length === 1 ? "" : "s"} exported to Anki.`);
  } catch { toast("AnkiConnect isn’t running. Your approved cards are still saved locally."); }
});

renderProject();
