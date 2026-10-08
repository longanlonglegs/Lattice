// "Needs attention": contradictions, and hypothesis guesses with no evidence yet.
// A panel over the web; each item focuses the web on the ideas involved.
import { $, escapeHtml } from "../util.js";
import { currentProject } from "../state.js";
import { originOf } from "../origins.js";
import { projectEdges, webCards } from "../pipeline.js";
import { needsAttention, shortText } from "../relations.js";
import { focusPair, select } from "./web-view.js";
import { icon } from "../icons.js";

let open = false;

export function setAttentionOpen(value) {
  open = value;
  renderAttention();
}

const label = card => escapeHtml(card.short || shortText(card.claim, 90));
const origin = card => `<span class="att-origin" style="--origin:${originOf(card.origin).colour}">${escapeHtml(originOf(card.origin).short)}</span>`;

export function renderAttention() {
  const project = currentProject();
  const cards = webCards(project);
  const byId = new Map(cards.map(card => [card.id, card]));
  const result = needsAttention(cards, projectEdges(project));
  $("#web-attention-count").textContent = result.total;
  $("#web-attention-toggle").classList.toggle("has-items", result.total > 0);
  $("#web-attention-toggle").setAttribute("aria-expanded", String(open));
  const panel = $("#web-attention");
  panel.classList.toggle("hidden", !open);
  if (!open) return;
  const section = (title, help, items) => `<section class="att-section"><p class="rail-label">${title} · ${items.length}</p>${items.length ? `<ul>${items.join("")}</ul>` : `<p class="att-empty">${help}</p>`}</section>`;
  panel.innerHTML = `
    <div class="att-head"><h3>Needs attention</h3><button class="drawer-close" type="button" aria-label="Close" data-att-close>${icon("close")}</button></div>
    ${section("CONTRADICTIONS BETWEEN IDEAS", "No contradictions between pieces of evidence. (Evidence against a hypothesis guess is counted on the guess.)", result.contradictions.map(edge => {
      const a = byId.get(edge.a), b = byId.get(edge.b);
      return `<li><button type="button" data-att-pair="${edge.a}|${edge.b}"><span>${origin(a)} ${label(a)}</span><span class="att-versus">✕ contradicts</span><span>${origin(b)} ${label(b)}</span></button><p>${escapeHtml(edge.rationale)}</p></li>`;
    }))}
    ${section("GUESSES WITH NO EVIDENCE YET", "Every hypothesis guess has evidence for or against it.", result.unsupportedGuesses.map(card => `<li><button type="button" data-att-card="${card.id}">${origin(card)} ${escapeHtml(card.claim)}</button></li>`))}`;
  panel.querySelector("[data-att-close]").addEventListener("click", () => setAttentionOpen(false));
  panel.querySelectorAll("[data-att-pair]").forEach(button => button.addEventListener("click", () => { const [a, b] = button.dataset.attPair.split("|").map(Number); focusPair(a, b); }));
  panel.querySelectorAll("[data-att-card]").forEach(button => button.addEventListener("click", () => select(Number(button.dataset.attCard), true)));
}
