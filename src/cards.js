// The Cards tab: accepted cards by source, a banner for cards waiting in the review deck, and the rejected ones at the bottom.
import { $, escapeHtml, plural } from "./util.js";
import { currentProject, persist, saveWorkspace, sourceCode, isOwnWork, recordActivity } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderInsights } from "./insights.js";
import { pendingCards } from "./review.js";
import { originOf } from "./origins.js";
import { getText } from "./db.js";
import { cardLocation, quoteInPages, shortCitation } from "./records.js";
import { projectEdges } from "./pipeline.js";
import { relationTypes, describeRelation, shortText } from "./relations.js";
import { icon } from "./icons.js";

// Which source groups and cards are open. Kept across re-renders; everything starts closed.
const openGroups = new Set();
const openCards = new Set();

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

// Two fixed columns, filled alternately so cards still read left to right. Unlike CSS columns, opening or closing a
// card only pushes down the cards beneath it; nothing jumps to the other column. On narrow screens the columns
// dissolve and each card's order puts them back in sequence.
const cardColumns = cards => `<div class="cards-grid">${[0, 1].map(column => `<div class="cards-col">${cards.filter((_, index) => index % 2 === column).join("")}</div>`).join("")}</div>`;

export function cardHtml(item, index, citation = "", relations = "") {
  const open = openCards.has(item.id) || item.editing;
  const connections = (relations.match(/<li /g) || []).length;
  const summary = [plural(item.quotes.length, "quote"), connections ? plural(connections, "connection") : ""].filter(Boolean).join(" · ");
  return `
    <article class="study-card evidence-card ${open ? "open" : ""} ${escapeHtml(item.state)} ${item.editing ? "editing" : ""} ${item.superseded ? "superseded" : ""}" style="order:${index}" data-id="${escapeHtml(item.id)}">
      <div class="card-top"><div>${originBadge(item.origin)}${citation ? `<span class="card-cite">${escapeHtml(citation)}</span>` : ""}${item.superseded ? ` <span class="superseded-tag" title="From an earlier version of your hypothesis">superseded</span>` : ""}</div><div><span class="card-index">${String(index + 1).padStart(2, "0")}</span><button class="card-edit" data-card-edit type="button">${item.editing ? "Done" : "Edit"}</button></div></div>
      <div class="card-prompt"><p class="card-label">Claim</p><p class="card-question">${escapeHtml(item.claim)}</p><textarea class="question" data-field="claim" aria-label="Edit claim">${escapeHtml(item.claim)}</textarea></div>
      <button class="card-expand" type="button" data-card-toggle aria-expanded="${open}" aria-controls="card-details-${escapeHtml(item.id)}"><span>${escapeHtml(summary)}</span><svg class="icon chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg></button>
      <div class="card-details" id="card-details-${escapeHtml(item.id)}"><div class="card-details-inner">
      ${item.quotes.map((quote, number) => `<div class="card-quote" data-quote="${number}"><span class="quote-mark">“</span><p>${escapeHtml(quote.text)}</p><textarea class="answer" data-field="quote" data-quote-index="${number}" aria-label="Edit quote ${number + 1}">${escapeHtml(quote.text)}</textarea>
        <small class="card-location">${escapeHtml(quote.location)}</small>
        <span class="quote-badge ${quote.missing ? "" : "hidden"}" title="This quote no longer appears word-for-word in the stored source text.">⚠ Quote not found in source</span>
      </div>`).join("")}
      <div class="card-note-wrap">${item.note ? `<p class="card-note">${icon("edit")} ${escapeHtml(item.note)}</p>` : ""}<textarea class="note-input" data-field="note" aria-label="Your note" placeholder="Add your own note…">${escapeHtml(item.note || "")}</textarea></div>
      ${relations}
      <div class="card-actions">
        ${item.state === "rejected" ? `<button class="approve" data-action="restore">${icon("undo")} Restore</button>` : `<button class="reject" data-action="reject">${icon("close")} Reject</button>`}
      </div>
      </div></div>
    </article>`;
}

// Checks an edited quote against the source's stored text. Sources saved before
// full text was kept have nothing to check against, so they get no badge.
async function recheckQuote(item, index, block) {
  const quote = item.quotes[index];
  const stored = await getText(item.sourceId).catch(() => null);
  const missing = Boolean(stored) && !quoteInPages(quote.text, stored.pages);
  if (missing === Boolean(quote.missing)) return;
  if (missing) quote.missing = true; else delete quote.missing;
  block.querySelector(".quote-badge").classList.toggle("hidden", !missing);
  persist();
}

const editSnapshots = new Map(); // card id -> its text when Edit was opened

const groupKey = source => source.id || source.title;
function groupsHtml(groups, edges, cardById) {
  return groups.map(({ source, cards: groupCards }, number) => {
    const key = groupKey(source);
    const open = openGroups.has(key) || groupCards.some(item => item.editing);
    return `
    <section class="card-group ${open ? "open" : ""}" data-group="${escapeHtml(key)}">
      <h3 class="card-group-title"><button class="card-group-head" type="button" data-group-toggle aria-expanded="${open}" aria-controls="card-group-${number}"><span class="kind-chip ${isOwnWork(source) ? "own-work" : ""}">${source.kind === "other" ? "—" : sourceCode(source)}</span><span class="card-group-name">${escapeHtml(source.title)}</span><small>${plural(groupCards.length, "card")}</small><svg class="icon chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg></button></h3>
      <div class="card-group-body" id="card-group-${number}"><div class="card-group-inner">${cardColumns(groupCards.map((item, index) => cardHtml(item, index, shortCitation(source.meta), relationsHtml(item, edges, cardById))))}</div></div>
    </section>`;
  }).join("");
}

// Cards by source; hypothesis guesses first, superseded guesses last.
function groupBySource(project, cards) {
  const groups = project.sources.slice().reverse().map(source => ({ source, cards: cards.filter(item => item.sourceId === source.id) })).filter(group => group.cards.length);
  const known = new Set(project.sources.map(source => source.id));
  const loose = cards.filter(item => !known.has(item.sourceId) && item.origin !== "hypothesis");
  if (loose.length) groups.push({ source: { title: "Other cards", kind: "other" }, cards: loose });
  const guesses = cards.filter(item => item.origin === "hypothesis");
  const current = guesses.filter(item => !item.superseded);
  const earlier = guesses.filter(item => item.superseded);
  if (current.length) groups.unshift({ source: { title: "My hypothesis: current guesses", kind: "hypothesis", origin: "hypothesis" }, cards: current });
  if (earlier.length) groups.push({ source: { title: "Earlier hypothesis guesses (superseded)", kind: "hypothesis", origin: "hypothesis" }, cards: earlier });
  return groups;
}

export function renderCards() {
  const project = currentProject();
  const edges = projectEdges(project);
  const cardById = new Map(project.cards.map(item => [item.id, item]));
  const filter = $("#cards-origin-filter").value;
  const cards = project.cards.filter(item => filter === "all" || item.origin === filter);
  const accepted = cards.filter(item => item.state === "approved");
  const rejected = cards.filter(item => item.state === "rejected");
  const waiting = pendingCards(project).length;
  $("#cards-review-banner").classList.toggle("hidden", !waiting);
  $("#cards-review-count").textContent = plural(waiting, "new card");
  const empty = filter === "all"
    ? "<strong>No accepted cards yet.</strong><p>Use + Add evidence to add a source or some of your own work. You review each card Lattice extracts before it joins your project.</p>"
    : "<strong>No accepted cards from this origin.</strong><p>Choose All origins to see every card.</p>";
  const rejectedHtml = rejected.length
    ? `<details class="rejected-section"><summary>Rejected cards · ${rejected.length}<small>Not in the web, relations, Insights, or exports. Restore one to bring it back.</small></summary>${cardColumns(rejected.map((item, index) => cardHtml(item, index, shortCitation(project.sources.find(source => source.id === item.sourceId)?.meta))))}</details>`
    : "";
  $("#cards-grid").innerHTML = (accepted.length ? groupsHtml(groupBySource(project, accepted), edges, cardById) : `<div class="empty-cards">${empty}</div>`) + rejectedHtml;
  const findCard = node => cards.find(candidate => candidate.id === +node.closest("article").dataset.id);
  // Toggles flip in place (no re-render), so the open and close animations play.
  const toggle = (button, element, set, key) => {
    const open = !element.classList.contains("open");
    element.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    if (open) set.add(key); else set.delete(key);
  };
  $("#cards-grid").querySelectorAll("[data-group-toggle]").forEach(button => button.addEventListener("click", () => {
    const group = button.closest(".card-group");
    toggle(button, group, openGroups, group.dataset.group);
  }));
  $("#cards-grid").querySelectorAll("[data-card-toggle]").forEach(button => button.addEventListener("click", () => {
    const article = button.closest("article");
    toggle(button, article, openCards, +article.dataset.id);
  }));
  $("#cards-grid").querySelectorAll("textarea").forEach(node => node.addEventListener("input", event => {
    const item = findCard(event.target);
    if (event.target.dataset.field === "quote") item.quotes[+event.target.dataset.quoteIndex].text = event.target.value;
    else if (event.target.dataset.field === "note") item.note = event.target.value;
    else { item.claim = event.target.value; delete item.short; } // the AI headline no longer matches an edited claim
    saveWorkspace(); renderInsights();
    if (event.target.dataset.field === "quote") recheckQuote(item, +event.target.dataset.quoteIndex, event.target.closest(".card-quote"));
  }));
  $("#cards-grid").querySelectorAll("[data-card-edit]").forEach(button => button.addEventListener("click", () => {
    const item = findCard(button);
    item.editing = !item.editing;
    // Log an edit once, when the card is closed with a changed claim, quote, or note.
    const snapshot = JSON.stringify([item.claim, item.quotes.map(quote => quote.text), item.note]);
    if (item.editing) editSnapshots.set(item.id, snapshot);
    else if (editSnapshots.has(item.id)) {
      if (editSnapshots.get(item.id) !== snapshot) { recordActivity("edit", "Edited a card", item.short || item.claim.slice(0, 80)); renderActivityList(); }
      editSnapshots.delete(item.id);
    }
    persist(); renderCards();
  }));
  $("#cards-grid").querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const item = findCard(button);
    item.state = button.dataset.action === "restore" ? "approved" : "rejected";
    item.editing = false;
    recordActivity("decision", item.state === "approved" ? "Restored a rejected card" : "Rejected a card", item.short || cardLocation(item));
    saveWorkspace(); renderCards(); updateProgress(); renderInsights(); renderActivityList();
  }));
}
export function updateProgress() {
  $("#card-count").textContent = currentProject().cards.filter(item => item.state === "approved").length;
}
