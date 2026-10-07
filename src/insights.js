// The Insights tab: counts by origin and relation, suggestions built around the web, and the optional AI stress-test.
import { $, escapeHtml, toast, plural, relativeTime } from "./util.js";
import { currentProject, saveWorkspace, recordActivity, isOwnWork } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderTabs, showTab, openDrawer } from "./project-shell.js";
import { origins } from "./origins.js";
import { projectEdges, webCards } from "./pipeline.js";
import { relationTypes, needsAttention, edgeEnds } from "./relations.js";
import { setAttentionOpen } from "./web/attention.js";
import { pendingCards, requestReview } from "./review.js";

// tabs: false skips the tab refresh (which reschedules the pipeline); used when the pipeline itself reports progress.
export function renderInsights({ tabs = true } = {}) {
  const project = currentProject();
  const ideas = webCards(project);
  const evidence = project.cards.filter(item => item.state === "approved" && item.origin !== "hypothesis");
  const pending = pendingCards(project).length;
  const ownWork = project.sources.filter(isOwnWork).length;
  const edges = projectEdges(project);
  const attention = needsAttention(ideas, edges);

  $("#evidence-stats").innerHTML = Object.entries(origins).map(([key, origin]) => `
    <div class="evidence-stat" style="--origin:${origin.colour}"><strong>${ideas.filter(item => item.origin === key).length}</strong><span>${escapeHtml(origin.label.toLowerCase())} ${key === "hypothesis" ? "guesses" : "ideas"}</span></div>`).join("");
  $("#relation-stats").innerHTML = Object.entries(relationTypes).map(([key, type]) => `
    <span class="relation-stat" style="--rel:${type.colour}"><b>${edges.filter(edge => edge.relation === key).length}</b> ${escapeHtml(type.label.toLowerCase())}</span>`).join("");

  // [title, explanation, target] — target is a tab, "evidence" (the drawer), "attention" (the web panel), or "ai".
  const actions = [];
  if (!project.question.trim()) actions.push(["Frame the research question", "A question makes it possible to judge whether evidence is relevant.", "history"]);
  if (!project.hypothesis.trim()) actions.push(["Write a working hypothesis", "State what you expect so surprising evidence stands out, and Lattice can test each guess.", "history"]);
  if (project.question.trim() && !project.versions.length) actions.push(["Record your first version", "Save your question and hypothesis as version 1 so you can see how your thinking changes.", "history"]);
  if (!project.sources.length) actions.push(["Add your first source", "Import a paper, link, or your own notes.", "evidence"]);
  if (attention.contradictions.length) actions.push([`Resolve ${plural(attention.contradictions.length, "contradiction")}`, "Ideas in your web disagree. Check whether conditions, methods, or a hidden factor explain it.", "attention"]);
  if (attention.unsupportedGuesses.length) actions.push([`${plural(attention.unsupportedGuesses.length, "hypothesis guess")} ${attention.unsupportedGuesses.length === 1 ? "has" : "have"} no evidence`, "Look for a source or experiment that tests it, for or against.", "attention"]);
  if (attention.unsupportedDrafts.length) actions.push([`${plural(attention.unsupportedDrafts.length, "draft claim")} ${attention.unsupportedDrafts.length === 1 ? "lacks" : "lack"} support`, "Your draft asserts something no source or experiment backs up yet.", "attention"]);
  if (pending) actions.push([`Review ${plural(pending, "new card")}`, "Accept the ones worth keeping and reject the rest; only accepted cards join your web.", "review"]);
  if (project.sources.length && !ownWork) actions.push(["Add your own work", "Drafts, experiment logs, and results count as evidence too.", "evidence"]);
  if (evidence.length >= 3 && !project.aiAnalysis) actions.push(["Stress-test your evidence", "Run the optional AI read below to surface tensions and gaps.", "ai"]);
  if (!actions.length) actions.push(["Look for evidence that could prove you wrong", "A source that challenges your hypothesis is worth more than another that agrees.", "evidence"]);
  $("#next-actions").innerHTML = actions.slice(0, 4).map((action, index) => `<button class="next-action" type="button" data-next-action="${index}"><span>${index + 1}</span><div><strong>${escapeHtml(action[0])}</strong><small>${escapeHtml(action[1])}</small></div><i>→</i></button>`).join("");
  $("#next-actions").querySelectorAll("[data-next-action]").forEach(button => button.addEventListener("click", () => {
    const target = actions[+button.dataset.nextAction][2];
    if (target === "ai") $(".ai-evidence").scrollIntoView({ behavior: "smooth", block: "center" });
    else if (target === "evidence") openDrawer();
    else if (target === "attention") { showTab("web"); setAttentionOpen(true); }
    else if (target === "review") requestReview();
    else showTab(target);
  }));
  renderAiAnalysis();
  if (tabs) renderTabs();
}

const originForAi = origin => ({ experiment: "researcher's own experiment", draft: "researcher's own draft" }[origin] || "external source");

// What the stress-test sees: up to 12 accepted, source-grounded cards, the current hypothesis guesses,
// and the strongest relations between them.
export function inputsForAi() {
  const project = currentProject();
  const sourceById = new Map(project.sources.map(source => [source.id, source]));
  const evidence = project.cards
    .filter(item => {
      const source = sourceById.get(item.sourceId);
      return item.state === "approved" && item.origin !== "hypothesis" && source && (source.kind !== "url" || source.fetched) && item.quotes?.some(quote => quote.text?.trim());
    })
    .slice(0, 12)
    .map(item => ({ id: String(item.id), claim: item.claim, quote: item.quotes.map(quote => quote.text.trim()).filter(Boolean).join(" … ").slice(0, 4000), page: (item.quotes[0].location || "Source").trim().slice(0, 250), origin: originForAi(item.origin) }));
  const guesses = webCards(project).filter(item => item.origin === "hypothesis").slice(0, 5).map(item => ({ id: String(item.id), claim: item.claim }));
  const ids = new Set([...evidence, ...guesses].map(item => item.id));
  const relations = projectEdges(project)
    .filter(edge => ids.has(String(edge.a)) && ids.has(String(edge.b)))
    .sort((p, q) => q.confidence - p.confidence)
    .slice(0, 30)
    .map(edge => { const { from, to } = edgeEnds(edge); return { from_id: String(from), to_id: String(to), relation: edge.relation, rationale: edge.rationale }; });
  return { evidence, guesses, relations };
}
export const evidenceForAi = () => inputsForAi().evidence;

export function renderAiAnalysis() {
  const project = currentProject();
  const { evidence, guesses } = inputsForAi();
  const result = project.aiAnalysis;
  const status = $("#ai-status");
  const results = $("#ai-results");
  if (!result) {
    status.textContent = evidence.length ? `${plural(evidence.length, "source-grounded card")}${guesses.length ? `, ${plural(guesses.length, "hypothesis guess")}` : ""} and their relations ready. Analysis stays off until you opt in.` : "Add a source Lattice can read (a link, file, pasted text, or capture) to make source-grounded analysis available.";
    results.classList.add("hidden"); results.innerHTML = "";
    return;
  }
  const labels = new Map([...evidence.map(item => [item.id, item.page]), ...guesses.map(item => [item.id, "Hypothesis guess"])]);
  const sourceLabels = ids => (ids || []).map(id => labels.get(String(id)) || `Evidence ${id}`).join(" · ");
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
  const inputs = inputsForAi();
  if (!$("#ai-consent").checked) return toast("Confirm the one-time data sharing choice first.");
  if (!project.question.trim()) return toast("Add a research question before asking for an evidence analysis.");
  if (!inputs.evidence.length) return toast("Add a source Lattice can read first. Links that could not be fetched are not sent to AI.");
  const requestSignature = JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs });
  const button = $("#ai-analyze-button");
  button.disabled = true; button.textContent = "Analyzing evidence…";
  try {
    const response = await fetch("/api/evidence-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs }) });
    const payload = await response.json();
    if (!response.ok || !payload.analysis) throw new Error(payload.error || "The analysis could not be completed.");
    const currentSignature = JSON.stringify({ question: currentProject().question, hypothesis: currentProject().hypothesis, ...inputsForAi() });
    if (currentSignature !== requestSignature) {
      toast("The evidence changed while the analysis was running, so its result was not saved.");
      return;
    }
    project.aiAnalysis = { ...payload.analysis, generatedAt: new Date().toISOString(), evidenceCount: inputs.evidence.length };
    recordActivity("analysis", "Ran an AI evidence analysis", `${plural(inputs.evidence.length, "card")}, ${plural(inputs.guesses.length, "guess")}, ${plural(inputs.relations.length, "relation")}`);
    saveWorkspace(); renderActivityList(); renderInsights(); toast("Source-grounded evidence analysis is ready.");
  } catch (error) {
    toast(error.message || "The analysis could not be completed.");
  } finally {
    button.disabled = !$("#ai-consent").checked;
    button.innerHTML = "Analyze evidence <span>→</span>";
  }
}
