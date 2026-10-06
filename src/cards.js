// The evidence-card review list in the workspace.
import { $, escapeHtml, plural } from "./util.js";
import { currentProject, persist, saveWorkspace, sourceCode, isOwnWork, recordActivity, clearAiAnalysis } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderInsights } from "./judgment.js";
import { approvedCards } from "./library.js";
import { originOf } from "./origins.js";
import { getText } from "./db.js";
import { quoteInPages, shortCitation } from "./records.js";
import { projectEdges } from "./pipeline.js";
import { relationTypes, describeRelation, shortText } from "./relations.js";

export const originBadge = origin => `<span class="origin-badge" style="--origin:${originOf(origin).colour}">${escapeHtml(originOf(origin).label)}</span>`;

// "Contradicts · My experiment: …" lines under a card, strongest first.
function relationsHtml(item, edges, cardById) {
  const lines = edges.filter(edge => edge.a === item.id || edge.b === item.id).sort((p, q) => q.confidence - p.confidence).map(edge => {
    const { label, otherId } = describeRelation(edge, item.id);
    const other = cardById.get(otherId);
    return other ? `<li title="${escapeHtml(edge.rationale)}"><span class="rel-dot" style="--rel:${relationTypes[edge.relation].colour}"></span><span><b>${escapeHtml(label)}</b> · ${escapeHtml(originOf(other.origin).label)}: ${escapeHtml(shortText(other.claim, 80))}</span></li>` : "";
  }).filter(Boolean);
  return lines.length ? `<ul class="card-relations">${lines.slice(0, 6).join("")}${lines.length > 6 ? `<li>and ${lines.length - 6} more (see the Web tab)</li>` : ""}</ul>` : "";
}

export function cardHtml(item, index, citation = "", relations = "") {
  return `
    <article class="study-card evidence-card ${escapeHtml(item.state)} ${item.editing ? "editing" : ""} ${item.superseded ? "superseded" : ""}" data-id="${escapeHtml(item.id)}">
      <div class="card-top"><div>${originBadge(item.origin)}${citation ? `<span class="card-cite">${escapeHtml(citation)}</span>` : ""}${item.superseded ? ` <span class="superseded-tag" title="From an earlier version of your hypothesis">superseded</span>` : ""}</div><div><span class="card-index">${String(index + 1).padStart(2, "0")}</span><button class="card-edit" data-card-edit type="button">${item.editing ? "Done" : "Edit"}</button></div></div>
      <div class="card-prompt"><p class="card-label">CLAIM</p><p class="card-question">${escapeHtml(item.claim)}</p><textarea class="question" data-field="claim" aria-label="Edit claim">${escapeHtml(item.claim)}</textarea></div>
      <div class="card-quote"><span class="quote-mark">“</span><p>${escapeHtml(item.quote)}</p><textarea class="answer" data-field="quote" aria-label="Edit quote">${escapeHtml(item.quote)}</textarea>
        <small class="card-location">${escapeHtml(item.location)}</small>
        <span class="quote-badge ${item.quoteMissing ? "" : "hidden"}" title="This quote no longer appears word-for-word in the stored source text.">⚠ Quote not found in source</span>
      </div>
      ${relations}
      <div class="card-actions">
        <button class="reject ${item.state === "rejected" ? "chosen" : ""}" data-action="reject">${item.state === "rejected" ? "↶ Restore" : "× Reject"}</button>
        <button class="approve ${item.state === "approved" ? "chosen" : ""}" data-action="approve">${item.state === "approved" ? "✓ Saved" : "✓ Save"}</button>
      </div>
    </article>`;
}

// Checks an edited quote against the source's stored text. Sources saved before
// full text was kept have nothing to check against, so they get no badge.
async function recheckQuote(item, article) {
  const stored = await getText(item.sourceId).catch(() => null);
  const missing = Boolean(stored) && !quoteInPages(item.quote, stored.pages);
  if (missing === Boolean(item.quoteMissing)) return;
  item.quoteMissing = missing;
  article.querySelector(".quote-badge").classList.toggle("hidden", !missing);
  persist();
}

export function renderCards() {
  const project = currentProject();
  const edges = projectEdges(project);
  const cardById = new Map(project.cards.map(item => [item.id, item]));
  const filter = $("#cards-origin-filter").value;
  const cards = project.cards.filter(item => filter === "all" || item.origin === filter);
  const groups = project.sources.slice().reverse().map(source => ({ source, cards: cards.filter(item => item.sourceId === source.id) })).filter(group => group.cards.length);
  const known = new Set(project.sources.map(source => source.id));
  const loose = cards.filter(item => !known.has(item.sourceId) && item.origin !== "hypothesis");
  if (loose.length) groups.push({ source: { title: "Other cards", kind: "other" }, cards: loose });
  // Hypothesis guesses: the current ones first, earlier (superseded) ones last.
  const guesses = cards.filter(item => item.origin === "hypothesis");
  const current = guesses.filter(item => !item.superseded);
  const earlier = guesses.filter(item => item.superseded);
  if (current.length) groups.unshift({ source: { title: "My hypothesis: current guesses", kind: "hypothesis", origin: "hypothesis" }, cards: current });
  if (earlier.length) groups.push({ source: { title: "Earlier hypothesis guesses (superseded)", kind: "hypothesis", origin: "hypothesis" }, cards: earlier });
  $("#cards-grid").innerHTML = groups.length ? groups.map(({ source, cards: groupCards }) => `
    <section class="card-group">
      <header class="card-group-head"><span class="kind-chip ${isOwnWork(source) ? "own-work" : ""}">${source.kind === "other" ? "—" : sourceCode(source)}</span><h3>${escapeHtml(source.title)}</h3><small>${plural(groupCards.length, "card")}</small></header>
      <div class="cards-grid">${groupCards.map((item, index) => cardHtml(item, index, shortCitation(source.meta), relationsHtml(item, edges, cardById))).join("")}</div>
    </section>`).join("") : `<div class="empty-cards">${filter === "all" ? "<strong>No evidence cards yet.</strong><p>Use + Add evidence to add a source or some of your own work, and Lattice will extract cards here.</p>" : "<strong>No cards from this origin.</strong><p>Choose All origins to see every card.</p>"}</div>`;
  const findCard = node => cards.find(candidate => candidate.id === +node.closest("article").dataset.id);
  $("#cards-grid").querySelectorAll("textarea").forEach(node => node.addEventListener("input", event => {
    const item = findCard(event.target);
    item[event.target.dataset.field] = event.target.value;
    clearAiAnalysis(); saveWorkspace(); renderInsights();
    if (event.target.dataset.field === "quote") recheckQuote(item, event.target.closest("article"));
  }));
  $("#cards-grid").querySelectorAll("[data-card-edit]").forEach(button => button.addEventListener("click", () => {
    const item = findCard(button);
    item.editing = !item.editing;
    persist(); renderCards();
  }));
  $("#cards-grid").querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const item = findCard(button);
    const next = button.dataset.action === "approve" ? "approved" : "rejected";
    item.state = item.state === next ? "pending" : next;
    recordActivity("decision", item.state === "pending" ? "Reopened a card" : `${item.state === "approved" ? "Saved" : "Rejected"} a card`, item.location);
    clearAiAnalysis(); saveWorkspace(); renderCards(); updateProgress(); renderInsights(); renderActivityList();
  }));
}
export function updateProgress() {
  const cards = currentProject().cards;
  const reviewed = cards.filter(item => item.state !== "pending").length;
  const approved = approvedCards().length;
  $("#card-count").textContent = cards.length;
  $("#reviewed-count").textContent = `${reviewed} of ${cards.length} reviewed`;
  $("#meter-fill").style.width = `${cards.length ? reviewed / cards.length * 100 : 0}%`;
  $("#approved-summary").textContent = plural(approved, "saved card");
  $("#cards-nav-count").textContent = approved;
}
