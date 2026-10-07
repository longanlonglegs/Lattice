// The review deck: every newly generated card (from a source or from your hypothesis) is shown one at a time
// to accept or reject. Only accepted cards join the project: the web, relations, Insights, and exports.
import { $, escapeHtml, plural, toast } from "./util.js";
import { currentProject, persist, recordActivity } from "./state.js";
import { originOf } from "./origins.js";
import { shortCitation } from "./records.js";
import { renderProject } from "./workspace.js";

let open = false;
let editing = false;
let tally = { accepted: 0, rejected: 0 };

// Cards waiting for a decision, in the order they were added. Superseded guesses no longer need one.
export const pendingCards = project => project.cards.filter(item => item.state === "pending" && !item.superseded);

// Opens the deck if the current project has cards to review; if it is already open, new cards simply join it.
export function requestReview() {
  if (!pendingCards(currentProject()).length) return;
  if (!open) { open = true; editing = false; tally = { accepted: 0, rejected: 0 }; }
  renderReview();
}

export function closeReview() {
  if (!open) return;
  open = false;
  editing = false;
  $("#review-deck").classList.add("hidden");
  const project = currentProject();
  if (tally.accepted || tally.rejected) {
    recordActivity("decision", `Reviewed ${plural(tally.accepted + tally.rejected, "card")}`, `${tally.accepted} accepted, ${tally.rejected} rejected`, project);
    persist();
  }
  renderProject();
  const left = pendingCards(project).length;
  if (left) toast(`${plural(left, "card")} still waiting for review. Use “Review” in the Cards tab when you're ready.`);
}

function decide(state) {
  const project = currentProject();
  const item = pendingCards(project)[0];
  if (!item) return;
  saveEdits(item);
  item.state = state;
  tally[state === "approved" ? "accepted" : "rejected"] += 1;
  project.updatedAt = new Date().toISOString();
  persist();
  const deckCard = $("#review-deck .deck-card");
  deckCard?.classList.add(state === "approved" ? "leaving-right" : "leaving-left");
  setTimeout(() => (pendingCards(project).length ? renderReview() : finish()), 160);
}

function acceptAll() {
  const project = currentProject();
  const items = pendingCards(project);
  saveEdits(items[0]);
  items.forEach(item => { item.state = "approved"; });
  tally.accepted += items.length;
  project.updatedAt = new Date().toISOString();
  persist();
  finish();
}

function finish() {
  const { accepted, rejected } = tally;
  closeReview();
  toast(`Review done: ${accepted} accepted, ${rejected} rejected.`);
}

// Edits made in the deck are kept even if the card is then rejected.
function saveEdits(item) {
  if (!editing || !item) return;
  const claim = $("#deck-claim-input")?.value.trim();
  if (claim && claim !== item.claim) { item.claim = claim; delete item.short; }
  document.querySelectorAll("#review-deck [data-deck-quote]").forEach(area => { item.quotes[+area.dataset.deckQuote].text = area.value; });
  editing = false;
}

function renderReview() {
  const deck = $("#review-deck");
  const project = currentProject();
  const queue = pendingCards(project);
  if (!open || !queue.length) { deck.classList.add("hidden"); return; }
  deck.classList.remove("hidden");
  const item = queue[0];
  const done = tally.accepted + tally.rejected;
  const hypothesis = item.origin === "hypothesis";
  const source = project.sources.find(entry => entry.id === item.sourceId);
  const citation = shortCitation(source?.meta);
  const version = project.versions.find(entry => entry.id === item.versionId);
  const header = hypothesis
    ? `<p class="deck-kicker">YOUR HYPOTHESIS · GUESS FROM VERSION ${version?.number ?? "?"}</p><p class="deck-note">This is a guess split from your own hypothesis, not evidence from a source. Accept it to test it against your evidence.</p>`
    : `<p class="deck-kicker"><span class="origin-badge" style="--origin:${originOf(item.origin).colour}">${escapeHtml(originOf(item.origin).label)}</span> ${escapeHtml(citation || source?.meta?.title || source?.title || "")}</p>`;
  const quotes = item.quotes.map((quote, index) => editing
    ? `<textarea class="deck-quote-input" data-deck-quote="${index}" aria-label="Quote ${index + 1}">${escapeHtml(quote.text)}</textarea>`
    : `<blockquote>“${escapeHtml(quote.text)}”<small>${escapeHtml(quote.location)}</small></blockquote>`).join("");
  deck.innerHTML = `
    <div class="deck-panel" role="dialog" aria-modal="true" aria-labelledby="deck-title">
      <div class="deck-top"><div><p class="deck-progress" id="deck-title">Review new cards · ${queue.length} left${done ? ` · ${tally.accepted} accepted, ${tally.rejected} rejected` : ""}</p><div class="deck-bar"><i style="width:${done / (done + queue.length) * 100}%"></i></div></div><button class="ghost-button" type="button" data-deck="later">Later</button></div>
      <div class="deck-stack">${queue.length > 2 ? `<span class="deck-shadow two"></span>` : ""}${queue.length > 1 ? `<span class="deck-shadow one"></span>` : ""}
        <article class="deck-card ${hypothesis ? "hypothesis" : ""}" style="--origin:${originOf(item.origin).colour}">
          ${header}
          ${editing ? `<textarea class="deck-claim-input" id="deck-claim-input" aria-label="Claim">${escapeHtml(item.claim)}</textarea>` : `<h2 class="deck-claim">${escapeHtml(item.claim)}</h2>`}
          ${hypothesis ? `<p class="deck-from">From your hypothesis:</p>` : ""}
          <div class="deck-quotes">${quotes}</div>
          <button class="deck-edit" type="button" data-deck="edit">${editing ? "Done editing" : "✎ Edit"}</button>
        </article>
      </div>
      <div class="deck-actions">
        <button class="deck-reject" type="button" data-deck="reject"><b>×</b> Reject <small>←</small></button>
        <button class="deck-accept" type="button" data-deck="accept"><b>✓</b> Accept <small>→</small></button>
      </div>
      <button class="deck-all" type="button" data-deck="all">Accept all ${queue.length} remaining</button>
    </div>`;
  deck.querySelector('[data-deck="accept"]').addEventListener("click", () => decide("approved"));
  deck.querySelector('[data-deck="reject"]').addEventListener("click", () => decide("rejected"));
  deck.querySelector('[data-deck="all"]').addEventListener("click", acceptAll);
  deck.querySelector('[data-deck="later"]').addEventListener("click", closeReview);
  deck.querySelector('[data-deck="edit"]').addEventListener("click", () => {
    if (editing) { saveEdits(item); persist(); } else editing = true;
    renderReview();
    if (editing) $("#deck-claim-input").focus();
  });
}

// Keyboard: → or A accepts, ← or R rejects, Escape closes. Off while typing in the deck.
export function initReviewKeys() {
  document.addEventListener("keydown", event => {
    if (!open || event.target.closest("textarea, input")) return;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "a") { event.preventDefault(); decide("approved"); }
    else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "r") { event.preventDefault(); decide("rejected"); }
    else if (event.key === "Escape") closeReview();
  });
}
