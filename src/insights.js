// The Insights tab, read off the idea web: where the sources stand overall, each hypothesis guess with the
// evidence around it, and the contradictions and gaps that call for more research. Every section works from the
// web's cards and relations alone; the optional AI read adds the written summaries and suggestions.
import { $, escapeHtml, toast, plural, relativeTime } from "./util.js";
import { currentProject, saveWorkspace, recordActivity } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderTabs, showTab, openDrawer } from "./project-shell.js";
import { originOf } from "./origins.js";
import { projectEdges, webCards } from "./pipeline.js";
import { relationTypes, needsAttention, edgeEnds, shortText } from "./relations.js";
import { shortCitation } from "./records.js";
import { pendingCards, requestReview } from "./review.js";
import { select, focusPair } from "./web/web-view.js";

const MAX_AI_EVIDENCE = 24;
const MAX_AI_RELATIONS = 60;
const PER_SIDE = 4; // evidence cards drawn on each side of a guess before "+N more"

// Which side of a guess each relation puts a piece of evidence on (the same split as the web's for/against tally).
const sideOf = relation => ({ supports: "for", same: "for", contradicts: "against", refines: "nuance", explains: "nuance" }[relation]);
const sides = {
  for: { label: "For", mark: "▲", empty: "Nothing backs this up yet." },
  against: { label: "Against", mark: "▼", empty: "Nothing argues against it yet. Look for evidence that could prove it wrong." },
  nuance: { label: "Adds conditions or a cause", mark: "◇", empty: "" }
};
const verdicts = {
  supported: { label: "Holding up", hint: "The evidence mostly backs this part." },
  mixed: { label: "Contested", hint: "There is real evidence on both sides." },
  challenged: { label: "Under pressure", hint: "The evidence mostly goes against this part." },
  untested: { label: "Untested", hint: "Nothing bears on this part directly yet." }
};

// ---------- What the web says, without AI ----------

// The web's ideas and relations, grouped the way this page reads them.
function readWeb(project) {
  const cards = webCards(project);
  const byId = new Map(cards.map(card => [card.id, card]));
  const edges = projectEdges(project);
  const guesses = cards.filter(card => card.origin === "hypothesis");
  const around = guesses.map(guess => {
    const linked = { for: [], against: [], nuance: [] };
    for (const edge of edges) {
      if (edge.a !== guess.id && edge.b !== guess.id) continue;
      const other = byId.get(edge.a === guess.id ? edge.b : edge.a);
      if (!other || other.origin === "hypothesis") continue;
      linked[sideOf(edge.relation)]?.push({ card: other, edge });
    }
    Object.values(linked).forEach(list => list.sort((p, q) => q.edge.confidence - p.edge.confidence));
    return { guess, ...linked };
  });
  return { cards, byId, edges, guesses, around, attention: needsAttention(cards, edges) };
}

// The verdict the tallies alone suggest, used until (or where) the AI read has none.
function countVerdict({ for: pro, against }) {
  if (!pro.length && !against.length) return "untested";
  if (!against.length) return "supported";
  if (!pro.length) return "challenged";
  return pro.length >= against.length * 2 ? "supported" : against.length >= pro.length * 2 ? "challenged" : "mixed";
}

const quoted = guess => `“${escapeHtml(shortText(guess.claim.replace(/[.!?]+$/, ""), 70))}”`;
function countOverview(web, sourceCount) {
  if (!web.cards.length) return "Your web is empty, so there is nothing to compare yet. Add a source or some of your own work to get started.";
  const lines = web.around.map(item => {
    const verdict = countVerdict(item);
    if (verdict === "untested") return `Nothing tests ${quoted(item.guess)} yet.`;
    if (verdict === "supported") return `Your evidence backs ${quoted(item.guess)}${item.against.length ? `, with ${plural(item.against.length, "dissenting idea")}` : ""}.`;
    if (verdict === "challenged") return `Your evidence mostly goes against ${quoted(item.guess)}.`;
    return `Sources disagree on ${quoted(item.guess)}.`;
  });
  if (!web.guesses.length) lines.push("You haven’t written a working hypothesis, so there is nothing to test the evidence against yet.");
  const clashes = web.attention.contradictions.length;
  if (clashes) lines.push(`${plural(clashes, "pair")} of ideas from different sources contradict each other.`);
  return `${plural(web.cards.length - web.guesses.length, "idea")} from ${plural(sourceCount, "source")}. ${lines.join(" ")}`;
}

// Gaps the web itself shows: guesses nothing tests, guesses resting on a single source or only on your own work,
// and draft claims nothing supports.
function countGaps(web, project) {
  const gaps = [];
  for (const item of web.around) {
    const backing = [...item.for, ...item.against, ...item.nuance];
    const sourcesBehind = new Set(backing.map(({ card }) => card.sourceId));
    if (!item.for.length && !item.against.length) gaps.push({ kind: "Untested", title: "A part of your hypothesis nothing tests", explanation: item.guess.claim, research: "Find a source or run an experiment that bears on it directly, for or against.", cards: [item.guess] });
    else if (backing.every(({ card }) => card.origin === "experiment" || card.origin === "draft")) gaps.push({ kind: "Only your own work", title: "Tested only by your own work", explanation: `${item.guess.claim} Everything for or against it comes from your experiments or draft.`, research: "Check whether published work agrees with your results.", cards: [item.guess, ...backing.map(({ card }) => card)] });
    else if (sourcesBehind.size === 1) {
      const source = project.sources.find(entry => entry.id === [...sourcesBehind][0]);
      gaps.push({ kind: "Single source", title: "Rests on a single source", explanation: `Everything that bears on “${shortText(item.guess.claim, 80)}” comes from ${source ? shortCitation(source.meta) || source.title : "one source"}.`, research: "Look for an independent source or replication.", cards: [item.guess, ...backing.map(({ card }) => card)] });
    }
  }
  for (const draft of web.attention.unsupportedDrafts) gaps.push({ kind: "Unsupported claim", title: "A claim in your draft nothing supports", explanation: draft.claim, research: "Back it with a source or an experiment, or soften the claim.", cards: [draft] });
  return gaps;
}

// ---------- Rendering ----------

// The setup steps that come before the analysis is worth reading: [title, explanation, target].
function setupSteps(project) {
  const steps = [];
  if (!project.question.trim()) steps.push(["Frame the research question", "It's what every piece of evidence is read against.", "history"]);
  if (!project.hypothesis.trim()) steps.push(["Write a working hypothesis", "Lattice splits it into parts and tests each one.", "history"]);
  if (!project.sources.length) steps.push(["Add your first source", "A paper, a link, or your own notes.", "evidence"]);
  const pending = pendingCards(project).length;
  if (pending) steps.push([`Review ${plural(pending, "new card")}`, "Only accepted cards count here.", "review"]);
  return steps;
}

function sourceLabel(card, project) {
  if (card.origin === "hypothesis") return "My hypothesis";
  const source = project.sources.find(item => item.id === card.sourceId);
  const citation = shortCitation(source?.meta) || shortText(source?.meta?.title || source?.title || "", 28);
  return `${originOf(card.origin).short}${citation ? ` · ${citation}` : ""}`;
}

// A small evidence card, as it looks in the web; clicking it opens it there.
function ideaCard(card, project, { rel = "", why = "" } = {}) {
  const title = why ? `${card.claim}\n\n${why}` : card.claim;
  return `<button class="ins-card" type="button" data-ins-card="${card.id}" ${rel ? `data-rel="${rel}"` : ""} style="--origin:${originOf(card.origin).colour}" title="${escapeHtml(title)}">
    <span class="ins-card-kicker"><i></i>${escapeHtml(sourceLabel(card, project))}</span>
    <span class="ins-card-text">${escapeHtml(card.short || shortText(card.claim, 95))}</span></button>`;
}

const sideColumn = (key, list, project, guessId) => {
  if (!list.length && key === "nuance") return "";
  const extra = list.length - PER_SIDE;
  return `<div class="ins-side ins-side-${key}">
    <p class="ins-side-label"><span>${sides[key].mark}</span>${sides[key].label} <b>${list.length}</b></p>
    ${list.length ? list.slice(0, PER_SIDE).map(({ card, edge }) => ideaCard(card, project, { rel: edge.relation, why: `${relationTypes[edge.relation].label}: ${edge.rationale}` })).join("") : `<p class="ins-side-empty">${sides[key].empty}</p>`}
    ${extra > 0 ? `<button class="ins-more" type="button" data-ins-card="${guessId}">+ ${extra} more in the web</button>` : ""}
  </div>`;
};

function guessHtml(item, index, total, ai, project, hasRead) {
  const { guess } = item;
  const verdictKey = ai?.verdict || countVerdict(item);
  const verdict = verdicts[verdictKey];
  const prose = (label, text, tone) => text ? `<div class="ins-prose ${tone}"><p class="ins-prose-label">${label}</p><p>${escapeHtml(text)}</p></div>` : "";
  const analysis = ai
    ? `<div class="ins-prose-grid">${prose("WHERE THE EVIDENCE AGREES", ai.agreement, "agree") || `<div class="ins-prose agree muted"><p class="ins-prose-label">WHERE THE EVIDENCE AGREES</p><p>No evidence backs this part yet.</p></div>`}${prose("WHERE IT DISAGREES", ai.disagreement, "disagree") || `<div class="ins-prose disagree muted"><p class="ins-prose-label">WHERE IT DISAGREES</p><p>No evidence argues against it yet.</p></div>`}</div>
      ${ai.revision ? `<div class="ins-revision"><div><p class="ins-prose-label">CONSIDER REWORDING THIS PART</p><p>${escapeHtml(ai.revision)}</p></div><button class="ghost-button" type="button" data-ins-tab="history">Edit hypothesis</button></div>` : ""}
      ${ai.suggestions?.length ? `<div class="ins-next"><p class="ins-prose-label">NEXT STEPS</p><ol>${ai.suggestions.map(step => `<li><span class="priority ${escapeHtml(step.priority)}">${escapeHtml(step.priority)}</span><div><strong>${escapeHtml(step.action)}</strong><p>${escapeHtml(step.reason)}</p></div></li>`).join("")}</ol></div>` : ""}`
    : `<p class="ins-ai-hint">${hasRead ? "The last AI read didn’t cover this part. Run it again to include it." : "Run the AI read above for a summary of where the evidence agrees and disagrees on this part, and what to do next."}</p>`;
  return `<article class="ins-guess" data-verdict="${verdictKey}">
    <header class="ins-guess-head">
      <p class="ins-guess-number">PART ${index + 1} OF ${total}</p>
      <span class="ins-verdict" title="${escapeHtml(verdict.hint)}${ai ? "" : " (from the counts; run the AI read for a closer look)"}">${verdict.label}</span>
      <button class="ins-link" type="button" data-ins-card="${guess.id}">Open in web →</button>
    </header>
    <div class="ins-map">
      <svg class="ins-lines" aria-hidden="true"></svg>
      ${sideColumn("for", item.for, project, guess.id)}
      <div class="ins-hub" data-ins-hub>
        <p class="ins-hub-kicker">MY HYPOTHESIS · PART ${index + 1}</p>
        <p class="ins-hub-text">${escapeHtml(guess.claim)}</p>
        <p class="ins-hub-tally"><span class="for">▲ ${item.for.length} for</span><span class="against">▼ ${item.against.length} against</span></p>
      </div>
      ${sideColumn("against", item.against, project, guess.id)}
      ${item.nuance.length ? `<div class="ins-nuance">${sideColumn("nuance", item.nuance, project, guess.id)}</div>` : ""}
    </div>
    ${analysis}
  </article>`;
}

// Contradictions between pieces of evidence: the web's own, with the AI's explanation attached where it found the
// same pair, followed by any it found that the web has no edge for.
function contradictions(web, ai) {
  const key = (a, b) => [Number(a), Number(b)].sort((p, q) => p - q).join("|");
  const aiByPair = new Map((ai?.contradictions || []).map(item => [key(...item.evidence_ids), item]));
  const list = web.attention.contradictions.map(edge => ({ a: web.byId.get(edge.a), b: web.byId.get(edge.b), rationale: edge.rationale, ai: aiByPair.get(key(edge.a, edge.b)) }));
  const known = new Set(list.map(item => key(item.a.id, item.b.id)));
  for (const [pair, item] of aiByPair) {
    const [a, b] = item.evidence_ids.map(id => web.byId.get(Number(id)));
    if (a && b && !known.has(pair)) list.push({ a, b, rationale: "", ai: item, aiOnly: true });
  }
  return list;
}

function clashHtml(item, project) {
  return `<article class="ins-clash">
    <div class="ins-clash-pair">
      ${ideaCard(item.a, project)}
      <div class="ins-clash-link" aria-label="contradicts"><span>✕ contradicts</span></div>
      ${ideaCard(item.b, project)}
    </div>
    <div class="ins-clash-body">
      <p class="ins-clash-title">${escapeHtml(item.ai?.title || "These two ideas can't both be true")}${item.aiOnly ? ` <small class="ins-ai-tag">found by AI</small>` : ""}</p>
      <p>${escapeHtml(item.ai?.explanation || item.rationale)}</p>
      ${item.ai?.resolve ? `<p class="ins-resolve"><b>What could explain it</b> ${escapeHtml(item.ai.resolve)}</p>` : ""}
      <button class="ins-link" type="button" data-ins-pair="${item.a.id}|${item.b.id}">Show both in the web →</button>
    </div>
  </article>`;
}

function gapHtml(gap) {
  const chips = gap.cards.slice(0, 4).map(card => `<button class="ins-chip" type="button" data-ins-card="${card.id}" style="--origin:${originOf(card.origin).colour}" title="${escapeHtml(card.claim)}"><i></i>${escapeHtml(shortText(card.short || card.claim, 46))}</button>`).join("");
  return `<article class="ins-gap">
    <p class="ins-gap-kind">${escapeHtml(gap.kind)}</p>
    <h4>${escapeHtml(gap.title)}</h4>
    <p>${escapeHtml(gap.explanation)}</p>
    <p class="ins-gap-research"><b>Research next</b> ${escapeHtml(gap.research)}</p>
    ${chips ? `<div class="ins-chips">${chips}</div>` : ""}
  </article>`;
}

function stanceRows(web) {
  return web.around.map((item, index) => {
    const total = Math.max(1, item.for.length + item.against.length);
    return `<button class="ins-stance" type="button" data-ins-jump="${index}" title="${escapeHtml(item.guess.claim)}">
      <span class="ins-stance-name"><b>Part ${index + 1}</b> ${escapeHtml(shortText(item.guess.claim, 60))}</span>
      <span class="ins-stance-bar" aria-label="${item.for.length} for, ${item.against.length} against">
        <span class="against"><i style="width:${(item.against.length / total) * 100}%"></i></span>
        <span class="for"><i style="width:${(item.for.length / total) * 100}%"></i></span>
      </span>
      <span class="ins-stance-count"><em class="against">${item.against.length}</em> · <em class="for">${item.for.length}</em></span>
    </button>`;
  }).join("");
}

// The AI read in hand, if it is in the current format; older reads (a summary and tensions) are ignored.
const currentRead = project => project.aiAnalysis?.overview ? project.aiAnalysis : null;

// tabs: false skips the tab refresh (which reschedules the pipeline); used when the pipeline itself reports progress.
export function renderInsights({ tabs = true } = {}) {
  const project = currentProject();
  const web = readWeb(project);
  const ai = currentRead(project);
  const aiGuesses = new Map((ai?.guesses || []).map(item => [String(item.guess_id), item]));

  const steps = setupSteps(project);
  $("#ins-setup").classList.toggle("hidden", !steps.length);
  $("#ins-setup").innerHTML = steps.length ? `<p>Before this page can say much:</p>${steps.map((step, index) => `<button type="button" data-ins-step="${index}"><strong>${escapeHtml(step[0])}</strong><small>${escapeHtml(step[1])}</small><i>→</i></button>`).join("")}` : "";

  // 1. The big picture
  const evidenceCount = web.cards.length - web.guesses.length;
  const sourceCount = new Set(web.cards.filter(card => card.origin !== "hypothesis").map(card => card.sourceId)).size;
  const stats = [[evidenceCount, "ideas"], [sourceCount, "sources"], [web.edges.length, "connections"], [web.attention.contradictions.length, "contradictions"]];
  $("#ins-overview").innerHTML = `
    <div class="ins-overview-text">
      <p class="ins-overview-prose">${ai ? escapeHtml(ai.overview) : countOverview(web, sourceCount)}</p>
      <p class="ins-overview-note">${ai ? `AI read · ${escapeHtml(ai.confidence || "unknown")} confidence, from your cards only` : "Counted from your web. Run the AI read for a written summary."}</p>
      <div class="ins-stats">${stats.map(([count, label]) => `<span><b>${count}</b>${label}</span>`).join("")}</div>
    </div>
    ${web.around.length ? `<div class="ins-stances"><p class="ins-prose-label">EACH PART OF YOUR HYPOTHESIS <span><em class="against">against</em> · <em class="for">for</em></span></p>${stanceRows(web)}</div>` : ""}`;

  // 2. The hypothesis, part by part
  $("#ins-guesses").innerHTML = web.around.length
    ? web.around.map((item, index) => guessHtml(item, index, web.around.length, aiGuesses.get(String(item.guess.id)), project, Boolean(ai))).join("")
    : `<div class="ins-empty"><strong>No hypothesis to test yet</strong><p>Write a working hypothesis and Lattice splits it into parts, then gathers the evidence for and against each one here.</p><button class="primary" type="button" data-ins-tab="history">Write a hypothesis</button></div>`;

  // 3. Contradictions and gaps
  const clashes = contradictions(web, ai);
  const gaps = [...countGaps(web, project), ...(ai?.gaps || []).map(gap => ({ kind: "Found by AI", title: gap.title, explanation: gap.explanation, research: gap.research, cards: gap.related_ids.map(id => web.byId.get(Number(id))).filter(Boolean) }))];
  $("#ins-contradictions").innerHTML = `<h4 class="ins-sub">Contradictions <b>${clashes.length}</b></h4>${clashes.length ? clashes.map(item => clashHtml(item, project)).join("") : `<p class="ins-none">No two pieces of evidence contradict each other. Evidence against a part of your hypothesis is shown with that part above.</p>`}`;
  $("#ins-gaps").innerHTML = `<h4 class="ins-sub">Gaps that need more research <b>${gaps.length}</b></h4>${gaps.length ? `<div class="ins-gap-grid">${gaps.map(gapHtml).join("")}</div>` : `<p class="ins-none">${web.cards.length ? "Every part of your hypothesis is tested by more than one source." : "Gaps show up once your web has some evidence."}</p>`}`;

  bindInsights(steps);
  renderAiStatus(web);
  drawInsightLines();
  if (tabs) renderTabs();
}

function bindInsights(steps) {
  const panel = $("[data-panel='insights']");
  panel.querySelectorAll("[data-ins-step]").forEach(button => button.addEventListener("click", () => {
    const target = steps[+button.dataset.insStep][2];
    if (target === "evidence") openDrawer(); else if (target === "review") requestReview(); else showTab(target);
  }));
  panel.querySelectorAll("[data-ins-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.insTab)));
  panel.querySelectorAll("[data-ins-card]").forEach(button => button.addEventListener("click", () => { showTab("web"); select(Number(button.dataset.insCard), true); }));
  panel.querySelectorAll("[data-ins-pair]").forEach(button => button.addEventListener("click", () => {
    const [a, b] = button.dataset.insPair.split("|").map(Number);
    showTab("web"); focusPair(a, b);
  }));
  panel.querySelectorAll("[data-ins-jump]").forEach(button => button.addEventListener("click", () => {
    $("#ins-guesses").children[+button.dataset.insJump]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// ---------- Connector lines ----------
// Each guess's map is laid out by CSS; the lines from the guess to its evidence are drawn on top once the layout is
// known, and again whenever it changes size (including when the tab is first shown).

let observer = null;
function drawInsightLines() {
  if (!observer && window.ResizeObserver) {
    observer = new ResizeObserver(() => requestAnimationFrame(drawInsightLines));
    observer.observe($("#ins-guesses"));
  }
  document.querySelectorAll("#ins-guesses .ins-map").forEach(map => {
    const svg = map.querySelector(".ins-lines");
    const hub = map.querySelector("[data-ins-hub]");
    const box = map.getBoundingClientRect();
    if (!box.width || getComputedStyle(svg).display === "none") { svg.innerHTML = ""; return; }
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const h = hub.getBoundingClientRect();
    const local = rect => ({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top, cx: (rect.left + rect.right) / 2 - box.left, cy: (rect.top + rect.bottom) / 2 - box.top });
    const hb = local(h);
    svg.innerHTML = [...map.querySelectorAll(".ins-card[data-rel]")].map(card => {
      const c = local(card.getBoundingClientRect());
      const type = relationTypes[card.dataset.rel];
      let path;
      if (c.right <= hb.left) path = `M${hb.left},${hb.cy} C${hb.left - 40},${hb.cy} ${c.right + 40},${c.cy} ${c.right},${c.cy}`;
      else if (c.left >= hb.right) path = `M${hb.right},${hb.cy} C${hb.right + 40},${hb.cy} ${c.left - 40},${c.cy} ${c.left},${c.cy}`;
      else path = `M${hb.cx},${hb.bottom} C${hb.cx},${hb.bottom + 30} ${c.cx},${c.top - 30} ${c.cx},${c.top}`;
      return `<path d="${path}" stroke="${type.colour}" stroke-dasharray="${type.dash || ""}" />`;
    }).join("");
  });
}

// ---------- The AI read ----------

const originForAi = origin => ({ experiment: "researcher's own experiment", draft: "researcher's own draft" }[origin] || "external source");

// What the AI read sees: the current hypothesis guesses, up to 24 accepted, source-grounded cards (those in a
// contradiction first, then those most strongly tied to a guess), and the strongest relations between them.
export function inputsForAi() {
  const project = currentProject();
  const sourceById = new Map(project.sources.map(source => [source.id, source]));
  const cards = webCards(project);
  const edges = projectEdges(project);
  const guessIds = new Set(cards.filter(item => item.origin === "hypothesis").map(item => item.id));
  const weight = new Map();
  for (const edge of edges) {
    const bonus = edge.relation === "contradicts" && !guessIds.has(edge.a) && !guessIds.has(edge.b) ? 2 : guessIds.has(edge.a) || guessIds.has(edge.b) ? 1 : 0;
    for (const id of [edge.a, edge.b]) weight.set(id, Math.max(weight.get(id) || 0, bonus + edge.confidence));
  }
  const evidence = cards
    .filter(item => {
      const source = sourceById.get(item.sourceId);
      return item.origin !== "hypothesis" && source && (source.kind !== "url" || source.fetched) && item.quotes?.some(quote => quote.text?.trim());
    })
    .sort((p, q) => (weight.get(q.id) || 0) - (weight.get(p.id) || 0))
    .slice(0, MAX_AI_EVIDENCE)
    .map(item => ({ id: String(item.id), claim: item.claim, quote: item.quotes.map(quote => quote.text.trim()).filter(Boolean).join(" … ").slice(0, 4000), page: [item.quotes[0].location || "Source", shortCitation(sourceById.get(item.sourceId)?.meta)].filter(Boolean).join(" · ").slice(0, 250), origin: originForAi(item.origin) }));
  const guesses = cards.filter(item => item.origin === "hypothesis").slice(0, 5).map(item => ({ id: String(item.id), claim: item.claim }));
  const ids = new Set([...evidence, ...guesses].map(item => item.id));
  const relations = edges
    .filter(edge => ids.has(String(edge.a)) && ids.has(String(edge.b)))
    .sort((p, q) => q.confidence - p.confidence)
    .slice(0, MAX_AI_RELATIONS)
    .map(edge => { const { from, to } = edgeEnds(edge); return { from_id: String(from), to_id: String(to), relation: edge.relation, rationale: edge.rationale }; });
  return { evidence, guesses, relations };
}
export const evidenceForAi = () => inputsForAi().evidence;
let reading = false; // an AI read is in flight
let loadingTimer = null;

// While the AI reads, a loading screen takes the place of the three sections and walks through what it is doing.
function setReading(value, inputs) {
  reading = value;
  $("[data-panel='insights']").classList.toggle("is-reading", value);
  $("#ins-loading").classList.toggle("hidden", !value);
  clearInterval(loadingTimer);
  if (!value) return;
  const steps = [
    `Reading ${plural(inputs.evidence.length, "card")} and ${plural(inputs.relations.length, "connection")}`,
    inputs.guesses.length ? `Weighing the evidence on ${plural(inputs.guesses.length, "part")} of your hypothesis` : "Weighing the evidence",
    "Looking for contradictions and gaps",
    "Writing your summary and next steps"
  ];
  const started = Date.now();
  const tick = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    $("#ins-loading-step").textContent = steps[Math.min(steps.length - 1, Math.floor(seconds / 6))];
    $("#ins-loading-time").textContent = `${seconds}s · this usually takes under a minute`;
  };
  tick();
  loadingTimer = setInterval(tick, 1000);
}
const signatureOf = (project, inputs) => JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs });

function renderAiStatus(web) {
  const project = currentProject();
  const inputs = inputsForAi();
  const status = $("#ai-status");
  const button = $("#ai-analyze-button");
  const ai = currentRead(project);
  if (ai) {
    const stale = ai.signature && ai.signature !== signatureOf(project, inputs);
    status.innerHTML = `Last read ${escapeHtml(relativeTime(ai.generatedAt))} from ${plural(ai.evidenceCount, "card")}.${stale ? ` <b>Your web has changed since; run it again to catch up.</b>` : ""}`;
  } else if (project.aiAnalysis) status.innerHTML = "<b>Your saved AI read is in an older format.</b> Run it again to fill in this page.";
  else status.textContent = inputs.evidence.length
    ? `Reads ${plural(inputs.evidence.length, "card")}${web.guesses.length ? ` against ${plural(inputs.guesses.length, "part")} of your hypothesis` : ""}, using only your cards and the relations Lattice found. Stays off until you opt in.`
    : "Add a source Lattice can read (a link, file, pasted text, or capture) to make the AI read available.";
  if (!reading) button.innerHTML = `${ai ? "Run again" : "Run AI read"} <span>→</span>`;
}

export async function analyzeEvidence() {
  const project = currentProject();
  const inputs = inputsForAi();
  if (!$("#ai-consent").checked) return toast("Confirm the one-time data sharing choice first.");
  if (!project.question.trim()) return toast("Add a research question before asking for an AI read.");
  if (!inputs.evidence.length) return toast("Add a source Lattice can read first. Links that could not be fetched are not sent to AI.");
  const requestSignature = signatureOf(project, inputs);
  const button = $("#ai-analyze-button");
  button.disabled = true; button.textContent = "Reading your web…";
  setReading(true, inputs);
  $(".ins-ai").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const response = await fetch("/api/evidence-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs }) });
    const payload = await response.json();
    if (!response.ok || !payload.analysis) throw new Error(payload.error || "The analysis could not be completed.");
    // A server started before this version answers in the old format, which this page can't show.
    if (typeof payload.analysis.overview !== "string") throw new Error("Your local Lattice server is running an older version. Stop it, run npm start again, and retry.");
    // Kept even if the web changed meanwhile (new links keep arriving in the background); the page then says it is out of date.
    project.aiAnalysis = { ...payload.analysis, generatedAt: new Date().toISOString(), evidenceCount: inputs.evidence.length, signature: requestSignature };
    recordActivity("analysis", "Ran an AI read of the evidence", `${plural(inputs.evidence.length, "card")}, ${plural(inputs.guesses.length, "guess")}, ${plural(inputs.relations.length, "relation")}`);
    saveWorkspace(); renderActivityList(); toast("Your AI read is ready.");
  } catch (error) {
    toast(error.message || "The analysis could not be completed.");
  } finally {
    setReading(false);
    button.disabled = !$("#ai-consent").checked;
    renderInsights();
  }
}
