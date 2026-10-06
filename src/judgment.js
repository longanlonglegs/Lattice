// The Insights tab (formerly the Judgment step): evidence counts, next actions, and the optional AI stress-test.
import { $, escapeHtml, toast, plural, relativeTime } from "./util.js";
import { currentProject, saveWorkspace, recordActivity, isOwnWork } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderTabs, showTab, openDrawer } from "./project-shell.js";

export function renderInsights() {
  const project = currentProject();
  const cards = project.cards.filter(item => item.state !== "rejected" && item.origin !== "hypothesis");
  const saved = cards.filter(item => item.state === "approved").length;
  const pending = cards.filter(item => item.state === "pending").length;
  const ownWork = project.sources.filter(isOwnWork).length;
  $("#evidence-stats").innerHTML = `
    <div class="evidence-stat s-sources"><strong>${project.sources.length - ownWork}</strong><span>external sources</span></div>
    <div class="evidence-stat s-work"><strong>${ownWork}</strong><span>pieces of your work</span></div>
    <div class="evidence-stat s-cards"><strong>${cards.length}</strong><span>evidence cards</span></div>
    <div class="evidence-stat s-saved"><strong>${saved}</strong><span>saved</span></div>`;
  const actions = [];
  if (!project.question.trim()) actions.push(["Frame the research question", "A question makes it possible to judge whether evidence is relevant.", "history"]);
  if (!project.hypothesis.trim()) actions.push(["Write a working hypothesis", "State what you expect so surprising evidence stands out.", "history"]);
  if (project.question.trim() && !project.versions.length) actions.push(["Record your first version", "Save your question and hypothesis as version 1 so you can see how your thinking changes.", "history"]);
  if (!project.sources.length) actions.push(["Add your first source", "Import a paper, link, or your own notes.", "evidence"]);
  if (pending) actions.push([`Review ${plural(pending, "new card")}`, "Save the ones worth keeping and reject the rest.", "cards"]);
  if (project.sources.length && !ownWork) actions.push(["Add your own work", "Drafts, experiment logs, and results count as evidence too.", "evidence"]);
  if (cards.length >= 3 && !project.aiAnalysis) actions.push(["Stress-test your evidence", "Run the optional AI read below to surface tensions and gaps.", "ai"]);
  if (!actions.length) actions.push(["Look for evidence that could prove you wrong", "A source that challenges your hypothesis is worth more than another that agrees.", "evidence"]);
  $("#next-actions").innerHTML = actions.slice(0, 3).map((action, index) => `<button class="next-action" type="button" data-next-action="${index}"><span>${index + 1}</span><div><strong>${action[0]}</strong><small>${action[1]}</small></div><i>→</i></button>`).join("");
  $("#next-actions").querySelectorAll("[data-next-action]").forEach(button => button.addEventListener("click", () => {
    const target = actions[+button.dataset.nextAction][2];
    if (target === "ai") $(".ai-evidence").scrollIntoView({ behavior: "smooth", block: "center" });
    else if (target === "evidence") openDrawer();
    else showTab(target);
  }));
  renderAiAnalysis(); renderTabs();
}
export function evidenceForAi() {
  const project = currentProject();
  const sourceById = new Map(project.sources.map(source => [source.id, source]));
  return project.cards
    .filter(item => {
      const source = sourceById.get(item.sourceId);
      return item.state !== "rejected" && source && (source.kind !== "url" || source.fetched) && item.quote?.trim() && item.location?.trim();
    })
    .sort((a, b) => (b.state === "approved") - (a.state === "approved"))
    .slice(0, 12)
    .map(item => ({ id: String(item.id), quote: item.quote.trim().slice(0, 4000), page: item.location.trim().slice(0, 250), origin: { experiment: "researcher's own experiment", draft: "researcher's own draft" }[item.origin] || "external source" }));
}
export function renderAiAnalysis() {
  const project = currentProject();
  const evidence = evidenceForAi();
  const result = project.aiAnalysis;
  const status = $("#ai-status");
  const results = $("#ai-results");
  if (!result) {
    status.textContent = evidence.length ? `${plural(evidence.length, "source-grounded card")} ready. Analysis stays off until you opt in.` : "Add a source Lattice can read (a link, file, pasted text, or capture) to make source-grounded analysis available.";
    results.classList.add("hidden"); results.innerHTML = "";
    return;
  }
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const sourceLabels = ids => (ids || []).map(id => evidenceById.get(String(id))?.page || `Evidence ${id}`).join(" · ");
  status.textContent = `Last analysis: ${relativeTime(result.generatedAt)} · ${plural(result.evidenceCount, "source-grounded card")} · ${result.confidence || "unknown"} confidence`;
  results.classList.remove("hidden");
  results.innerHTML = `
    <div class="ai-summary"><span>AI EVIDENCE READ</span><p>${escapeHtml(result.summary || "No summary returned.")}</p></div>
    <div class="ai-detail-grid">
      <div><p class="ai-result-label">TENSIONS TO CHECK</p>${(result.tensions || []).length ? `<ol class="ai-tensions">${result.tensions.map(item => `<li><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.explanation)}</p><small>${escapeHtml(sourceLabels(item.evidence_ids))}</small></li>`).join("")}</ol>` : `<p class="ai-empty">No specific tension surfaced from these cards.</p>`}</div>
      <div><p class="ai-result-label">NEXT RESEARCH MOVES</p>${(result.next_actions || []).length ? `<ol class="ai-actions">${result.next_actions.map(item => `<li><span class="priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.reason)}</p></div></li>`).join("")}</ol>` : `<p class="ai-empty">No next action returned.</p>`}</div>
    </div>`;
}
export async function analyzeEvidence() {
  const project = currentProject();
  const evidence = evidenceForAi();
  if (!$("#ai-consent").checked) return toast("Confirm the one-time data sharing choice first.");
  if (!project.question.trim()) return toast("Add a research question before asking for an evidence analysis.");
  if (!evidence.length) return toast("Add a source Lattice can read first. Links that could not be fetched are not sent to AI.");
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
    recordActivity("analysis", "Ran an AI evidence analysis", plural(evidence.length, "source-grounded card"));
    saveWorkspace(); renderActivityList(); renderInsights(); toast("Source-grounded evidence analysis is ready.");
  } catch (error) {
    toast(error.message || "The analysis could not be completed.");
  } finally {
    button.disabled = !$("#ai-consent").checked;
    button.innerHTML = "Analyze evidence <span>→</span>";
  }
}
