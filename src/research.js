import { $, escapeHtml } from "./util.js";
import { currentProject } from "./state.js";
import { icon } from "./icons.js";
import { recommendationContext, rankRecommendations, normalizedDoi } from "./research-recommendations.js";
import { openDrawer } from "./project-shell.js";

let projectId;
let request;
let papers = [];
let topic = "";
let context;
let personalized = true;
let revision = "";
let refreshTimer;
const recommendationCache = new Map();

function updateResearchHeading() {
  $("#research-return").classList.toggle("hidden", personalized || !context?.plans.length);
  $("#research-list-title").textContent = personalized ? "For your project" : "Search results";
  $("#research-context").textContent = context?.plans.length
    ? `${context.hypothesis ? "Based on your hypothesis" : "Based on your question and reading"}${context.sources.length ? ` · ${context.sources.length} saved ${context.sources.length === 1 ? "paper" : "papers"}` : ""}`
    : "Add papers or a hypothesis to get a reading list tailored to your project.";
}
const external = (url, label) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ${icon("external")}</a>`;

function renderDirections() {
  const query = $("#research-query").value.trim();
  topic = query;
  if (personalized && context?.plans.length) {
    $("#research-directions").innerHTML = context.plans.map((plan, index) => `<button type="button" class="research-direction" data-plan="${index}"><span><strong>${escapeHtml(plan.label)}</strong><small>${escapeHtml(plan.detail.slice(0, 120))}${plan.detail.length > 120 ? "…" : ""}</small></span>${icon("external")}</button>`).join("");
  } else {
  const directions = [
    ["review", "Get the overview", "Look for reviews and broader context.", "review"],
    ["methods", "Explore the methods", "See how this question is studied.", "methods"],
    ["limitations", "Challenge the idea", "Search for limitations and mixed findings.", "limitations"]
  ];
  $("#research-directions").innerHTML = directions.map(([id, title, description]) => `<button type="button" class="research-direction" data-direction="${id}" ${query.length < 3 ? "disabled" : ""}><span><strong>${title}</strong><small>${description}</small></span>${icon("external")}</button>`).join("");
  }
  const encoded = encodeURIComponent(query || context?.plans[0]?.query || "");
  $("#research-places").innerHTML = [
    external(`https://scholar.google.com/scholar?q=${encoded}`, "Google Scholar"),
    external(`https://pubmed.ncbi.nlm.nih.gov/?term=${encoded}`, "PubMed · health & biology"),
    external(`https://arxiv.org/search/?query=${encoded}&searchtype=all`, "arXiv · science & computing")
  ].join("");
}

function renderPapers() {
  if (!papers.length) {
    $("#research-results").innerHTML = '<div class="research-empty"><h3>No new matches yet.</h3><p>Try a different search or add more papers to refine your reading list.</p></div>';
    return;
  }
  const project = currentProject();
  $("#research-results").innerHTML = papers.map((paper, index) => {
    const saved = project?.sources.some(source => normalizedDoi(source.meta?.doi || source.doi || source.originalUrl || source.url) === normalizedDoi(paper.doi));
    const authors = paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");
    return `<article class="research-paper"><div class="research-paper-body"><p class="research-paper-meta">${escapeHtml([paper.year, paper.venue].filter(Boolean).join(" · ") || "Publication details unavailable")}</p><h3>${external(paper.url, paper.title)}</h3>${paper.reason ? `<p class="research-reason">${escapeHtml(paper.reason)}</p>` : ""}${authors ? `<p class="research-authors">${escapeHtml(authors)}</p>` : ""}${paper.abstract ? `<details><summary>Abstract</summary><p>${escapeHtml(paper.abstract)}</p></details>` : ""}</div>${project ? `<button class="research-add" type="button" data-research-add="${index}" aria-label="${saved ? "Already in project" : "Add paper to project"}" title="${saved ? "Already in project" : "Add to " + escapeHtml(project.title)}" ${saved ? "disabled" : ""}>${icon(saved ? "check" : "plus")}</button>` : ""}</article>`;
  }).join("");
}

export function renderResearch() {
  const project = currentProject();
  const next = recommendationContext(project);
  const changed = revision !== next.key;
  context = next;
  if (projectId !== (project?.id || null) || changed) {
    request?.abort();
    projectId = project?.id || null;
    revision = next.key;
    personalized = true;
    papers = [];
    $("#research-query").value = "";
    $("#research-status").textContent = "";
    if (context.plans.length) loadRecommendations();
    else $("#research-results").innerHTML = '<div class="research-empty"><span aria-hidden="true">↗</span><h3>A reading list that grows with you.</h3><p>Add a hypothesis or papers to your project, or search for a topic above.</p></div>';
  } else if (personalized && context.plans.length && !$("#research-results").hasAttribute("aria-busy")) loadRecommendations();
  else if (papers.length) renderPapers();
  updateResearchHeading();
  renderDirections();
}

async function loadRecommendations() {
  if (!context?.plans.length) return;
  personalized = true;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const snapshot = context;
  const recent = $("#research-period").value === "recent";
  const key = `${snapshot.key}:${recent}`;
  updateResearchHeading();
  renderDirections();
  $("#research-results").removeAttribute("aria-busy");
  const cached = recommendationCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
    papers = cached.papers;
    $("#research-status").textContent = `${papers.length} new papers · Topic matches, not verdicts on your hypothesis.`;
    renderPapers();
    return;
  }
  papers = [];
  $("#research-status").textContent = "Finding your next reads…";
  $("#research-results").setAttribute("aria-busy", "true");
  $("#research-results").innerHTML = '<div class="research-empty">Following the topics in your hypothesis and reading…</div>';
  const results = await Promise.allSettled(snapshot.plans.map(async plan => {
    const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: plan.query, recent }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Paper search is unavailable.");
    return data.papers;
  }));
  if (controller.signal.aborted || request !== controller) return;
  $("#research-results").removeAttribute("aria-busy");
  const successful = results.filter(result => result.status === "fulfilled");
  if (!successful.length) {
    $("#research-status").textContent = "Couldn't load your reading list. Try a search or reopen Research to retry.";
    $("#research-results").innerHTML = '<div class="research-empty"><h3>Paper discovery is unavailable.</h3><p>Your project is safe. You can still use the links under Look further.</p></div>';
    revision = ""; // retry on the next visit, rather than caching a failure
    return;
  }
  papers = rankRecommendations(successful.flatMap(result => result.value), snapshot);
  if (successful.length === results.length) {
    if (recommendationCache.size >= 20) recommendationCache.delete(recommendationCache.keys().next().value);
    recommendationCache.set(key, { papers, time: Date.now() });
  }
  $("#research-status").textContent = `${papers.length} new papers · ${successful.length < results.length ? "Some searches were unavailable. " : ""}Topic matches, not verdicts on your hypothesis.`;
  renderPapers();
}

async function searchPapers() {
  if (!$("#research-form").reportValidity()) return;
  personalized = false;
  updateResearchHeading();
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const query = $("#research-query").value.trim();
  renderDirections();
  $("#research-status").textContent = "Finding papers…";
  $("#research-results").setAttribute("aria-busy", "true");
  $("#research-results").innerHTML = '<div class="research-empty">Searching Crossref…</div>';
  papers = [];
  try {
    const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, recent: $("#research-period").value === "recent" }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Paper search is unavailable.");
    if (request !== controller) return;
    papers = data.papers;
    $("#research-status").textContent = `${papers.length} matches for “${query}” · Ranked by Crossref relevance, not evidence quality.`;
    renderPapers();
  } catch (error) {
    if (controller.signal.aborted) return;
    $("#research-status").textContent = error.message;
    $("#research-results").innerHTML = '<div class="research-empty"><h3>Try another way in.</h3><p>Search again, or open one of the indexes under Look further.</p></div>';
  } finally {
    if (request === controller) $("#research-results").removeAttribute("aria-busy");
  }
}

export function initResearch() {
  $("#research-form").addEventListener("submit", event => { event.preventDefault(); searchPapers(); });
  $("#research-query").addEventListener("input", renderDirections);
  $("#research-return").addEventListener("click", loadRecommendations);
  $("#research-period").addEventListener("change", () => { if (personalized) loadRecommendations(); else if ($("#research-query").value.trim().length >= 3) searchPapers(); });
  window.addEventListener("lattice:project-updated", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!$("#research-view").classList.contains("hidden")) renderResearch();
    }, 1000);
  });
  $("#research-directions").addEventListener("click", event => {
    const plan = event.target.closest("[data-plan]");
    if (plan) {
      $("#research-query").value = context.plans[Number(plan.dataset.plan)].query;
      searchPapers();
      return;
    }
    const button = event.target.closest("[data-direction]");
    if (!button) return;
    $("#research-query").value = `${topic.slice(0, 285)} ${button.dataset.direction}`;
    searchPapers();
  });
  $("#research-results").addEventListener("click", event => {
    const button = event.target.closest("[data-research-add]");
    if (!button || !currentProject()) return;
    const paper = papers[Number(button.dataset.researchAdd)];
    if (!paper) return;
    // Reuse the normal import flow; the user confirms extraction in the drawer.
    document.querySelector('.source-tab[data-tab="link"]').click();
    $("#source-input").value = paper.url;
    openDrawer();
    $("#source-input").focus();
  });
}
