// The Insights tab, read off the idea web: where the sources stand overall, each hypothesis guess with the
// evidence around it, and the contradictions and gaps that call for more research, ending on one next step. Every
// section works from the web's cards and relations alone; the optional AI read adds written summaries that cite the
// cards they rest on. Every card on the page opens in place to show its quote and why it sits where it does.
import { $, escapeHtml, plural, relativeTime } from "./util.js";
import { currentProject, saveWorkspace, recordActivity } from "./state.js";
import { renderActivityList } from "./workspace.js";
import { renderTabs, showTab, openDrawer } from "./project-shell.js";
import { originOf } from "./origins.js";
import { projectEdges, webCards, pipelineStatus } from "./pipeline.js";
import { relationTypes, needsAttention, edgeEnds, describeRelation, shortText } from "./relations.js";
import { shortCitation } from "./records.js";
import { pendingCards, requestReview } from "./review.js";
import { select, focusPair } from "./web/web-view.js";

const MAX_AI_EVIDENCE = 24;
const MAX_AI_RELATIONS = 60;
const MAX_AI_GUESSES = 5; // the server reads at most this many hypothesis guesses
const PER_SIDE = 4; // evidence cards drawn on each side of a guess before "+N more"

// Which side of a guess a relation puts a piece of evidence on. For and against match the web's tally; refines and
// explains depend on direction: evidence that refines or explains the guess adds a condition or a cause, while
// evidence the guess refines or explains is something the guess would account for.
function sideOf(edge, guessId) {
  if (edge.relation === "supports" || edge.relation === "same") return "for";
  if (edge.relation === "contradicts") return "against";
  if (edge.relation === "refines" || edge.relation === "explains") return Number(edgeEnds(edge).to) === Number(guessId) ? "nuance" : "explained";
  return null;
}
const sides = {
  for: { label: "For", line: "supports", empty: "Nothing backs this up yet." },
  against: { label: "Against", line: "contradicts", empty: "Nothing argues against it yet. Look for evidence that could prove it wrong: a guess that survives that is much stronger." },
  nuance: { label: "Adds a condition or a cause", line: "refines", empty: "" },
  explained: { label: "This part would explain", line: "explains", empty: "" }
};
const verdicts = {
  supported: { label: "Holding up", phrase: "holding up" },
  mixed: { label: "Contested", phrase: "contested" },
  challenged: { label: "Under pressure", phrase: "under pressure" },
  untested: { label: "Untested", phrase: "untested" }
};
const verdictOrder = ["challenged", "mixed", "untested", "supported"]; // weakest first, for picking the next step

// What stays open between renders (the page re-renders whenever the web changes): parts per project, card details,
// and where to come back to from the web.
const openParts = new Map();
const openWhy = new Set();
let returnAnchor = null;
let lastSteps = [];
let lastNextStep = null;

// ---------- What the web says, without AI ----------

function readWeb(project) {
  const cards = webCards(project);
  const byId = new Map(cards.map(card => [card.id, card]));
  const edges = projectEdges(project);
  const guesses = cards.filter(card => card.origin === "hypothesis");
  const around = guesses.map(guess => {
    const linked = { for: [], against: [], nuance: [], explained: [] };
    for (const edge of edges) {
      if (edge.a !== guess.id && edge.b !== guess.id) continue;
      const other = byId.get(edge.a === guess.id ? edge.b : edge.a);
      if (!other || other.origin === "hypothesis") continue;
      linked[sideOf(edge, guess.id)]?.push({ card: other, edge });
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

const listOf = items => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function countOverview(web, sourceCount) {
  if (!web.cards.length) return "Your web is empty, so there is nothing to compare yet. Add a source or some of your own work to get started.";
  const ideas = `${plural(web.cards.length - web.guesses.length, "idea")} from ${plural(sourceCount, "source")}.`;
  if (!web.guesses.length) return `${ideas} You haven’t written a working hypothesis, so there is nothing to test them against yet.`;
  const tally = {};
  web.around.forEach(item => { const key = countVerdict(item); tally[key] = (tally[key] || 0) + 1; });
  const parts = Object.keys(verdicts).filter(key => tally[key]).map(key => `${tally[key]} ${tally[key] === 1 ? "is" : "are"} ${verdicts[key].phrase}`);
  const stand = web.guesses.length === 1
    ? `The one part of your hypothesis is ${verdicts[Object.keys(tally)[0]].phrase}.`
    : `Of the ${web.guesses.length} parts of your hypothesis, ${listOf(parts)}.`;
  const clashes = web.attention.contradictions.length;
  return `${ideas} ${stand}${clashes ? ` ${plural(clashes, "pair")} of ideas from different sources contradict each other.` : ""}`;
}

// One diverging bar per part of the hypothesis: evidence against to the left of the axis, for to the right, scaled
// to the busiest part. A part's row jumps to (and opens) that part below.
function standChart(web, aiGuesses) {
  const max = Math.max(1, ...web.around.map(item => Math.max(item.for.length, item.against.length)));
  const rows = web.around.map((item, index) => {
    const verdict = aiGuesses.get(String(item.guess.id))?.verdict || countVerdict(item);
    const pro = item.for.length, con = item.against.length;
    return `<button class="ins-chart-row" type="button" data-open-part="${item.guess.id}" data-key="chart:${item.guess.id}" aria-label="Part ${index + 1}: ${escapeHtml(shortText(item.guess.claim, 80))}. ${pro} for, ${con} against. ${verdicts[verdict].label}.">
      <span class="ins-chart-label"><b>Part ${index + 1}</b>${escapeHtml(shortText(item.guess.claim, 48))}</span>
      <span class="ins-chart-bars" aria-hidden="true">
        <span class="against"><i style="width:${(con / max) * 82}%"></i><em>${con || ""}</em></span>
        <span class="for"><i style="width:${(pro / max) * 82}%"></i><em>${pro || ""}</em></span>
      </span>
      <span class="ins-chart-verdict" data-verdict="${verdict}">${verdicts[verdict].label}</span>
    </button>`;
  }).join("");
  return `<div class="ins-chart">
    <p class="ins-chart-head" aria-hidden="true"><span></span><span class="ins-chart-axis"><span class="against">Against</span><span class="for">For</span></span><span></span></p>
    ${rows}
  </div>`;
}

// What a part's evidence rests on, for the line that explains its verdict.
function basisOf(item, project) {
  const backing = [...item.for, ...item.against];
  const sourceIds = new Set(backing.map(({ card }) => card.sourceId));
  const ownOnly = backing.length && backing.every(({ card }) => card.origin === "experiment");
  const source = sourceIds.size === 1 ? project.sources.find(entry => entry.id === [...sourceIds][0]) : null;
  return { backing, sourceIds, ownOnly, source };
}

// Gaps the web itself shows: guesses resting on a single source or only on your own work. Untested guesses are already marked in their own part, so they aren't repeated here.
function countGaps(web, project) {
  const gaps = [];
  for (const item of web.around) {
    const { backing, sourceIds, ownOnly, source } = basisOf(item, project);
    if (!backing.length) continue;
    const cards = [item.guess, ...backing.map(({ card }) => card)];
    if (ownOnly) gaps.push({ kind: "Only your own work", guessId: item.guess.id, title: "Tested only by your own work", explanation: `Everything for or against “${shortText(item.guess.claim, 80)}” comes from your own experiments.`, research: "Check whether published work agrees with your results.", cards });
    else if (sourceIds.size === 1) gaps.push({ kind: "Single source", guessId: item.guess.id, title: "Rests on a single source", explanation: `Everything that bears on “${shortText(item.guess.claim, 80)}” comes from ${source ? shortCitation(source.meta) || source.title : "one source"}.`, research: "Look for an independent source or a replication.", cards });
  }
  return gaps;
}

// ---------- Small pieces ----------

// A short sample of a relation's line, drawn the way the web and the maps draw it.
function lineGlyph(key) {
  const type = relationTypes[key];
  if (!type) return "";
  const lines = type.double ? `<line x1="1" y1="3" x2="19" y2="3"/><line x1="1" y1="7" x2="19" y2="7"/>` : `<line x1="1" y1="5" x2="19" y2="5"/>`;
  return `<svg class="ins-glyph" viewBox="0 0 20 10" aria-hidden="true"><g stroke="${type.colour}" stroke-width="2" stroke-linecap="round"${type.dash ? ` stroke-dasharray="4 3"` : ""}>${lines}</g></svg>`;
}
const chevron = `<svg class="ins-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const aiTag = `<span class="ins-ai-tag">AI</span>`;

// The setup steps that come before the analysis is worth reading: [title, explanation, target].
function setupSteps(project) {
  const steps = [];
  if (!project.question.trim()) steps.push(["Frame the research question", "It’s what every piece of evidence is read against.", "history"]);
  if (!project.hypothesis.trim()) steps.push(["Write a working hypothesis", "Lattice splits it into parts and tests each one.", "history"]);
  if (!project.sources.length) steps.push(["Add your first source", "A paper, a link, or your own notes.", "evidence"]);
  const pending = pendingCards(project).length;
  if (pending) steps.push([`Review ${plural(pending, "new card")}`, "Only accepted cards count here.", "review"]);
  return steps;
}

function sourceOf(card, project) {
  return project.sources.find(item => item.id === card.sourceId);
}
function sourceLabel(card, project) {
  if (card.origin === "hypothesis") return "My hypothesis";
  const source = sourceOf(card, project);
  const citation = shortCitation(source?.meta) || shortText(source?.meta?.title || source?.title || "", 28);
  return `${originOf(card.origin).label}${citation ? ` · ${citation}` : ""}`;
}

// An evidence card as it looks in the web. Clicking it opens, in place, why it sits here and the quote it rests on.
function ideaCard(card, project, { edge = null, context = "" } = {}) {
  const key = `${context}:${card.id}`;
  const open = openWhy.has(key);
  const id = `ins-why-${context.replace(/[^a-z0-9]/gi, "-")}-${card.id}`;
  const quote = card.quotes?.find(item => item.text?.trim());
  const source = sourceOf(card, project);
  const where = [quote?.location, shortCitation(source?.meta) || source?.title].filter(Boolean).join(" · ");
  const relation = edge ? describeRelation(edge, card.id) : null;
  const why = `<div class="ins-why" id="${id}"${open ? "" : " hidden"}>
      ${edge ? `<p class="ins-why-rel">${lineGlyph(edge.relation)}<span><b>${escapeHtml(relation.label)}</b>${edge.rationale ? ` ${escapeHtml(edge.rationale)}` : ""}</span></p>` : ""}
      ${quote ? `<blockquote class="ins-why-quote"><p>${escapeHtml(shortText(quote.text, 360))}</p>${where ? `<cite>${escapeHtml(where)}</cite>` : ""}${quote.missing ? `<span class="quote-badge">Quote not found in source</span>` : ""}</blockquote>` : `<p class="ins-why-none">No quote is saved for this card.</p>`}
      <button class="ins-link" type="button" data-web-card="${card.id}" data-key="web:${key}">Show in the web →</button>
    </div>`;
  return `<div class="ins-card"${edge ? ` data-rel="${edge.relation}"` : ""} style="--origin:${originOf(card.origin).colour}">
    <button class="ins-card-face" type="button" aria-expanded="${open}" aria-controls="${id}" data-why="${escapeHtml(key)}" data-key="why:${escapeHtml(key)}">
      <span class="ins-card-kicker"><i></i>${escapeHtml(sourceLabel(card, project))}</span>
      <span class="ins-card-text">${escapeHtml(card.short || shortText(card.claim, 95))}</span>
    </button>${why}</div>`;
}

function sideColumn(key, list, project, guess) {
  if (!list.length && (key === "nuance" || key === "explained")) return "";
  const extra = list.length - PER_SIDE;
  return `<div class="ins-side ins-side-${key}">
    <p class="ins-side-label">${lineGlyph(sides[key].line)}${sides[key].label} <b>${list.length}</b></p>
    ${list.length ? list.slice(0, PER_SIDE).map(({ card, edge }) => ideaCard(card, project, { edge, context: `g${guess.id}` })).join("") : `<p class="ins-side-empty">${sides[key].empty}</p>`}
    ${extra > 0 ? `<button class="ins-more" type="button" data-web-card="${guess.id}" data-key="more:${guess.id}:${key}">${extra} more in the web →</button>` : ""}
  </div>`;
}

// Card chips under an AI summary: the cards it says it rests on. A chip opens that card in this part's map when it is
// drawn there, and in the web otherwise.
function citeChips(ids, web, guess) {
  const cards = (ids || []).map(id => web.byId.get(Number(id))).filter(Boolean);
  if (!cards.length) return "";
  return `<p class="ins-cites"><span>Based on</span>${cards.map(card => `<button class="ins-chip" type="button" data-cite="${card.id}" data-guess="${guess.id}" data-key="cite:${guess.id}:${card.id}" style="--origin:${originOf(card.origin).colour}"><i></i>${escapeHtml(shortText(card.short || card.claim, 46))}</button>`).join("")}</p>`;
}

// The line under a part's header that says where its verdict comes from.
function verdictBasis(item, verdictKey, ai, project) {
  const { backing, sourceIds, ownOnly } = basisOf(item, project);
  let text;
  if (verdictKey === "untested") text = "Nothing in your web bears on this part directly yet.";
  else if (ai) text = "The AI read weighed what the quotes say, not just the counts.";
  else {
    const rests = ownOnly ? ", all from your own work" : sourceIds.size === 1 ? ", all from one source" : "";
    text = `From the counts: ${item.for.length} for and ${item.against.length} against${rests}.${backing.length < 3 ? " That’s thin, so treat the verdict as a first impression." : ""}`;
  }
  const reassure = verdictKey === "challenged" || verdictKey === "mixed" ? ` <span class="ins-reassure">Evidence against a guess is progress: it shows you what to test or reword next.</span>` : "";
  return `<p class="ins-basis">${text}${reassure}</p>`;
}

function partHtml(item, index, web, ai, aiGuess, project) {
  const { guess } = item;
  const verdictKey = aiGuess?.verdict || countVerdict(item);
  const open = openParts.get(project.id)?.has(guess.id);
  const total = item.for.length + item.against.length;
  const prose = (label, text, ids, tone, empty) => `<div class="ins-prose ${tone}${text ? "" : " muted"}"><p class="ins-label">${lineGlyph(tone === "agree" ? "supports" : "contradicts")}${label}</p><p>${escapeHtml(text || empty)}</p>${text ? citeChips(ids, web, guess) : ""}</div>`;
  const analysis = aiGuess
    ? `<div class="ins-prose-grid">${prose("Where the evidence agrees", aiGuess.agreement, aiGuess.agreement_ids, "agree", "No evidence backs this part yet.")}${prose("Where it disagrees", aiGuess.disagreement, aiGuess.disagreement_ids, "disagree", "No evidence argues against it yet.")}</div>
      ${aiGuess.revision ? `<div class="ins-revision"><div><p class="ins-label">Consider rewording this part</p><p class="ins-revision-text">${escapeHtml(aiGuess.revision)}</p></div><button class="ghost-button" type="button" data-tab="history" data-key="reword:${guess.id}">Edit hypothesis</button></div>` : ""}
      ${aiGuess.suggestions?.length ? `<div class="ins-steps"><p class="ins-label">Next steps for this part</p><ol>${aiGuess.suggestions.map(step => `<li><span class="ins-priority" data-priority="${escapeHtml(step.priority)}">${escapeHtml(step.priority)}</span><div><strong>${escapeHtml(step.action)}</strong><p>${escapeHtml(step.reason)}</p></div></li>`).join("")}</ol></div>` : ""}`
    : ai
      ? `<p class="ins-ai-hint">${index >= MAX_AI_GUESSES ? `The AI read covers the first ${MAX_AI_GUESSES} parts of your hypothesis, so this part only has its counts.` : "Your hypothesis changed after the last AI read. Run it again to read this part."}</p>`
      : "";
  const forShare = total ? (item.for.length / total) * 100 : 0;
  return `<article class="ins-part" data-verdict="${verdictKey}" id="ins-part-${guess.id}">
    <h4 class="ins-part-head"><button class="ins-part-toggle" type="button" aria-expanded="${Boolean(open)}" aria-controls="ins-part-body-${guess.id}" data-part="${guess.id}" data-key="part:${guess.id}">
      <span class="ins-part-num">Part ${index + 1}</span>
      <span class="ins-part-claim">${escapeHtml(guess.claim)}</span>
      <span class="ins-verdict">${verdicts[verdictKey].label}${aiGuess ? ` ${aiTag}` : ""}</span>
      <span class="ins-tally"><span class="for">${item.for.length} for</span><span class="against">${item.against.length} against</span></span>
      <span class="ins-bar${total ? "" : " empty"}" aria-hidden="true"><i class="for" style="width:${forShare}%"></i><i class="against" style="width:${total ? 100 - forShare : 0}%"></i></span>
      ${chevron}
    </button></h4>
    <div class="ins-part-body" id="ins-part-body-${guess.id}"${open ? "" : " hidden"}>
      ${verdictBasis(item, verdictKey, aiGuess, project)}
      <div class="ins-map">
        <svg class="ins-lines" aria-hidden="true"></svg>
        ${sideColumn("for", item.for, project, guess)}
        <div class="ins-hub" data-ins-hub><p class="ins-hub-text">${escapeHtml(guess.claim)}</p></div>
        ${sideColumn("against", item.against, project, guess)}
        ${item.nuance.length || item.explained.length ? `<div class="ins-extra">${sideColumn("nuance", item.nuance, project, guess)}${sideColumn("explained", item.explained, project, guess)}</div>` : ""}
      </div>
      ${analysis}
      <button class="ins-link ins-part-web" type="button" data-web-card="${guess.id}" data-key="web:part:${guess.id}">Show this part in the web →</button>
    </div>
  </article>`;
}

// Contradictions between pieces of evidence: the web's own, with the AI's explanation attached where it found the
// same pair, followed by any it found that the web has no edge for.
function contradictions(web, ai) {
  const key = (a, b) => [Number(a), Number(b)].sort((p, q) => p - q).join("|");
  const aiByPair = new Map((ai?.contradictions || []).map(item => [key(...item.evidence_ids), item]));
  const list = web.attention.contradictions.map(edge => ({ a: web.byId.get(edge.a), b: web.byId.get(edge.b), edge, ai: aiByPair.get(key(edge.a, edge.b)) }));
  const known = new Set(list.map(item => key(item.a.id, item.b.id)));
  for (const [pair, item] of aiByPair) {
    const [a, b] = item.evidence_ids.map(id => web.byId.get(Number(id)));
    if (a && b && !known.has(pair)) list.push({ a, b, edge: null, ai: item, aiOnly: true });
  }
  return list;
}

function clashHtml(item, project) {
  const context = `c${item.a.id}-${item.b.id}`;
  return `<article class="ins-clash">
    <p class="ins-clash-title">${escapeHtml(item.ai?.title || "These two ideas can’t both be true")}${item.aiOnly ? ` <span class="ins-ai-tag">Found by AI</span>` : ""}</p>
    ${item.ai?.explanation || item.edge?.rationale ? `<p class="ins-clash-text">${escapeHtml(item.ai?.explanation || item.edge.rationale)}</p>` : ""}
    <div class="ins-clash-pair">
      ${ideaCard(item.a, project, { edge: item.edge, context })}
      <div class="ins-clash-link"><span>${lineGlyph("contradicts")}contradicts</span></div>
      ${ideaCard(item.b, project, { edge: item.edge, context })}
    </div>
    ${item.ai?.resolve ? `<p class="ins-resolve"><b>What could explain it</b> ${escapeHtml(item.ai.resolve)}</p>` : ""}
    <button class="ins-link" type="button" data-web-pair="${item.a.id}|${item.b.id}" data-key="pair:${item.a.id}|${item.b.id}">Show both in the web →</button>
  </article>`;
}

function gapHtml(gap, index) {
  const chips = gap.cards.slice(0, 4).map(card => `<button class="ins-chip" type="button" data-web-card="${card.id}" data-key="gap:${index}:${card.id}" style="--origin:${originOf(card.origin).colour}"><i></i>${escapeHtml(shortText(card.short || card.claim, 46))}</button>`).join("");
  return `<li class="ins-gap">
    <p class="ins-gap-title">${escapeHtml(gap.title)} <span class="${gap.ai ? "ins-ai-tag" : "ins-gap-kind"}">${escapeHtml(gap.kind)}</span></p>
    <p>${escapeHtml(gap.explanation)}</p>
    <p class="ins-gap-research"><b>Research next:</b> ${escapeHtml(gap.research)}</p>
    ${chips ? `<p class="ins-cites">${chips}</p>` : ""}
  </li>`;
}

// The one thing to do next: the most urgent AI suggestion on the weakest part, else the plainest gap the web shows.
function nextStep(web, ai, aiGuesses, clashes, gaps) {
  const ranked = web.around
    .map((item, index) => ({ item, index, verdict: aiGuesses.get(String(item.guess.id))?.verdict || countVerdict(item) }))
    .sort((p, q) => verdictOrder.indexOf(p.verdict) - verdictOrder.indexOf(q.verdict));
  for (const { item, index } of ranked) {
    const steps = aiGuesses.get(String(item.guess.id))?.suggestions || [];
    const step = steps.find(entry => entry.priority === "now") || steps[0];
    if (step) return { action: step.action, reason: `${step.reason} (Part ${index + 1})`, button: `Open part ${index + 1}`, target: { part: item.guess.id } };
  }
  const untested = ranked.find(entry => entry.verdict === "untested");
  if (untested) return { action: `Find evidence that tests part ${untested.index + 1} of your hypothesis`, reason: `Nothing in your web bears on “${shortText(untested.item.guess.claim, 90)}” yet, for or against.`, button: "+ Add evidence", target: { evidence: true } };
  if (clashes.length) return { action: "Work out why two of your sources disagree", reason: clashes[0].ai?.resolve || `“${shortText(clashes[0].a.claim, 70)}” and “${shortText(clashes[0].b.claim, 70)}” can’t both be true as stated.`, button: "Show both in the web", target: { pair: [clashes[0].a.id, clashes[0].b.id] } };
  if (gaps.length) return { action: gaps[0].research, reason: gaps[0].explanation, button: gaps[0].cards[0] ? "Show in the web" : "", target: gaps[0].cards[0] ? { card: gaps[0].cards[0].id } : null };
  if (!ai && web.guesses.length) return { action: "Run the AI read for a closer look", reason: "The counts look settled. The AI read checks what the quotes actually say about each part.", button: "", target: null };
  return null;
}

// The AI read in hand, if it is in the current format; older reads (a summary and tensions) are ignored.
const currentRead = project => project.aiAnalysis?.overview ? project.aiAnalysis : null;

// ---------- Rendering ----------

// tabs: false skips the tab refresh (which reschedules the pipeline); used when the pipeline itself reports progress.
export function renderInsights({ tabs = true } = {}) {
  const project = currentProject();
  if (!project) return;
  bindOnce();
  const panel = $("[data-panel='insights']");
  const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  const web = readWeb(project);
  const ai = currentRead(project);
  const aiGuesses = new Map((ai?.guesses || []).map(item => [String(item.guess_id), item]));
  if (!openParts.has(project.id) && web.guesses.length) openParts.set(project.id, new Set([web.guesses[0].id]));

  lastSteps = setupSteps(project);
  $("#ins-setup").classList.toggle("hidden", !lastSteps.length);
  $("#ins-setup").innerHTML = lastSteps.length ? `<p>Before this page can say much:</p>${lastSteps.map((step, index) => `<button type="button" data-step="${index}" data-key="step:${index}"><strong>${escapeHtml(step[0])}</strong><small>${escapeHtml(step[1])}</small><span aria-hidden="true">→</span></button>`).join("")}` : "";

  // Where the sources stand
  const sourceCount = new Set(web.cards.filter(card => card.origin !== "hypothesis").map(card => card.sourceId)).size;
  const stale = ai && isStale(ai, project);
  // The for/against chart is always shown (it is counted, not written); the AI read adds its summary beside it.
  const totals = `${plural(web.cards.length - web.guesses.length, "idea")} from ${plural(sourceCount, "source")}${web.attention.contradictions.length ? ` · ${plural(web.attention.contradictions.length, "contradiction")}` : ""}`;
  $("#ins-overview").classList.toggle("has-chart", web.around.length > 0);
  $("#ins-overview").innerHTML = `
    <div class="ins-overview-text">
      ${ai ? `<p class="ins-overview-prose">${escapeHtml(ai.overview)}</p><p class="ins-overview-note">${aiTag} Written by the AI read from your cards only, ${escapeHtml(ai.confidence || "unknown")} confidence${stale ? ". Your web has changed since." : "."}</p>`
        : web.around.length ? `<p class="ins-overview-prose">${escapeHtml(totals)}.</p><p class="ins-overview-note">Counted from your web. The AI read adds a written summary here.</p>`
        : `<p class="ins-overview-prose">${escapeHtml(countOverview(web, sourceCount))}</p>`}
    </div>
    ${web.around.length ? standChart(web, aiGuesses) : ""}`;

  // How each part is holding up
  $("#ins-guesses-legend").classList.toggle("hidden", !web.around.length);
  $("#ins-guesses").innerHTML = web.around.length
    ? web.around.map((item, index) => partHtml(item, index, web, ai, aiGuesses.get(String(item.guess.id)), project)).join("")
    : `<div class="ins-empty"><strong>No hypothesis to test yet</strong><p>Write a working hypothesis and Lattice splits it into parts, then gathers the evidence for and against each one here.</p><button class="primary" type="button" data-tab="history" data-key="write-hypothesis">Write a hypothesis</button></div>`;

  // Contradictions and gaps
  const clashes = contradictions(web, ai);
  const aiGaps = (ai?.gaps || []).map(gap => ({ kind: "Found by AI", ai: true, title: gap.title, explanation: gap.explanation, research: gap.research, related: gap.related_ids.map(String), cards: gap.related_ids.map(id => web.byId.get(Number(id))).filter(Boolean) }));
  // Where the AI read describes a gap around the same guess, its version replaces the counted one.
  const gaps = [...countGaps(web, project).filter(gap => !gap.guessId || !aiGaps.some(item => item.related.includes(String(gap.guessId)))), ...aiGaps];
  $("#ins-contradictions").innerHTML = `<h4 class="ins-sub">Contradictions <b>${clashes.length}</b></h4>${clashes.length ? clashes.map(item => clashHtml(item, project)).join("") : `<p class="ins-none">No two pieces of evidence contradict each other. Evidence against a part of your hypothesis is shown with that part above.</p>`}`;
  $("#ins-gaps").innerHTML = `<h4 class="ins-sub">Gaps that need more research <b>${gaps.length}</b></h4>${gaps.length ? `<ul class="ins-gap-list">${gaps.map(gapHtml).join("")}</ul>` : `<p class="ins-none">${web.cards.length ? "No gaps: every tested part of your hypothesis rests on more than one source." : "Gaps show up once your web has some evidence."}</p>`}`;

  // Your next step
  lastNextStep = lastSteps.length ? null : nextStep(web, ai, aiGuesses, clashes, gaps);
  $("#ins-next").classList.toggle("hidden", !lastNextStep);
  $("#ins-next").innerHTML = lastNextStep ? `<h3 class="ins-title">Your next step</h3><div class="ins-next-body"><div><p class="ins-next-action">${escapeHtml(lastNextStep.action)}</p><p class="ins-next-reason">${escapeHtml(lastNextStep.reason)}</p></div>${lastNextStep.button ? `<button class="primary" type="button" data-next data-key="next">${escapeHtml(lastNextStep.button)}</button>` : ""}</div>` : "";

  renderAiStatus(web);
  drawInsightLines();
  if (focusKey) panel.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  if (tabs) renderTabs();
}

// ---------- Interaction ----------

// From Insights to the web, with a way back to the same spot.
function goToWeb(action, anchor) {
  returnAnchor = anchor;
  showTab("web");
  action();
  $("#web-back-insights").classList.remove("hidden");
}
function backFromWeb() {
  showTab("insights");
  $("#web-back-insights").classList.add("hidden");
  requestAnimationFrame(() => {
    const target = returnAnchor && document.querySelector(`[data-panel='insights'] [data-key="${CSS.escape(returnAnchor)}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  });
}

function openPart(guessId, { scroll = false } = {}) {
  const project = currentProject();
  if (!openParts.has(project.id)) openParts.set(project.id, new Set());
  openParts.get(project.id).add(Number(guessId));
  renderInsights({ tabs: false });
  if (scroll) requestAnimationFrame(() => $(`#ins-part-${guessId}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
}

let bound = false;
function bindOnce() {
  if (bound) return;
  bound = true;
  $("#web-back-insights").addEventListener("click", backFromWeb);
  $("#ai-cancel").addEventListener("click", () => controller?.abort());
  // The AI read lives in a dialog: the button on the Insights heading opens it; Escape or × closes it.
  $("#ai-open").addEventListener("click", () => $("#ai-dialog").showModal());
  $("#ai-dialog-close").addEventListener("click", () => $("#ai-dialog").close());
  $("[data-panel='insights']").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const data = button.dataset;
    const project = currentProject();
    if (data.step !== undefined) {
      const target = lastSteps[+data.step]?.[2];
      if (target === "evidence") openDrawer(); else if (target === "review") requestReview(); else if (target) showTab(target);
    } else if (data.tab) showTab(data.tab);
    else if (data.part) {
      const open = openParts.get(project.id) || new Set();
      const id = Number(data.part);
      if (open.has(id)) open.delete(id); else open.add(id);
      openParts.set(project.id, open);
      renderInsights({ tabs: false });
    } else if (data.why) {
      if (openWhy.has(data.why)) openWhy.delete(data.why); else openWhy.add(data.why);
      renderInsights({ tabs: false });
    } else if (data.webCard) goToWeb(() => select(Number(data.webCard), true), data.key);
    else if (data.webPair) {
      const [a, b] = data.webPair.split("|").map(Number);
      goToWeb(() => focusPair(a, b), data.key);
    } else if (data.cite) {
      // Open the cited card in this part's map if it is drawn there; otherwise find it in the web.
      const key = `g${data.guess}:${data.cite}`;
      if (document.querySelector(`#ins-part-${data.guess} [data-why="${CSS.escape(key)}"]`)) {
        openWhy.add(key);
        renderInsights({ tabs: false });
        document.querySelector(`[data-key="why:${CSS.escape(key)}"]`)?.focus();
      } else goToWeb(() => select(Number(data.cite), true), data.key);
    } else if (data.openPart) openPart(data.openPart, { scroll: true });
    else if (data.next !== undefined && lastNextStep?.target) {
      const target = lastNextStep.target;
      if (target.part) openPart(target.part, { scroll: true });
      else if (target.evidence) openDrawer();
      else if (target.pair) goToWeb(() => focusPair(...target.pair), "next");
      else if (target.card) goToWeb(() => select(target.card, true), "next");
    }
  });
}

// ---------- Connector lines ----------
// Each guess's map is laid out by CSS; the lines from the guess to its evidence are drawn on top once the layout is
// known, and again whenever it changes size (including when the tab is first shown or a card opens).

let observer = null;
function drawInsightLines() {
  if (!observer && window.ResizeObserver) {
    observer = new ResizeObserver(() => requestAnimationFrame(drawInsightLines));
    observer.observe($("#ins-guesses"));
  }
  document.querySelectorAll("#ins-guesses .ins-part-body:not([hidden]) .ins-map").forEach(map => {
    const svg = map.querySelector(".ins-lines");
    const hub = map.querySelector("[data-ins-hub]");
    const box = map.getBoundingClientRect();
    if (!box.width || getComputedStyle(svg).display === "none") { svg.innerHTML = ""; return; }
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const local = rect => ({ left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top, cx: (rect.left + rect.right) / 2 - box.left, cy: (rect.top + rect.bottom) / 2 - box.top });
    const hb = local(hub.getBoundingClientRect());
    svg.innerHTML = [...map.querySelectorAll(".ins-card[data-rel]")].map(card => {
      // Lines meet the card's face, so they stay put when its details open below.
      const c = local(card.querySelector(".ins-card-face").getBoundingClientRect());
      const type = relationTypes[card.dataset.rel];
      let path;
      if (c.right <= hb.left) path = `M${hb.left},${hb.cy} C${hb.left - 40},${hb.cy} ${c.right + 40},${c.cy} ${c.right},${c.cy}`;
      else if (c.left >= hb.right) path = `M${hb.right},${hb.cy} C${hb.right + 40},${hb.cy} ${c.left - 40},${c.cy} ${c.left},${c.cy}`;
      else path = `M${hb.cx},${hb.bottom} C${hb.cx},${hb.bottom + 30} ${c.cx},${c.top - 30} ${c.cx},${c.top}`;
      return `<path d="${path}" stroke="${type.colour}"${type.dash ? ` stroke-dasharray="${type.dash}"` : ""} />`;
    }).join("");
  });
}

// ---------- The AI read ----------

const originForAi = origin => (origin === "experiment" ? "researcher's own experiment" : "external source");

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
  const guesses = cards.filter(item => item.origin === "hypothesis").slice(0, MAX_AI_GUESSES).map(item => ({ id: String(item.id), claim: item.claim }));
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
let controller = null;
let loadingTimer = null;
let noKey = false; // the server said AI isn't configured
let aiMessage = null; // { projectId, text, tone: "error" | "note" }, shown in the AI box until the next read

const signatureOf = (project, inputs) => JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs });
const isStale = (ai, project) => Boolean(ai.signature && ai.signature !== signatureOf(project, inputsForAi()));

// What has changed since a read, in a few words ("hypothesis edited, 2 cards added").
function changesSince(ai, project, inputs) {
  const basis = ai.basis;
  if (!basis) return "";
  const changes = [];
  if (basis.question !== project.question) changes.push("question edited");
  if (basis.hypothesis !== project.hypothesis) changes.push("hypothesis edited");
  const before = new Map(basis.evidence);
  const now = new Map(inputs.evidence.map(item => [item.id, item.claim]));
  const added = [...now.keys()].filter(id => !before.has(id)).length;
  const removed = [...before.keys()].filter(id => !now.has(id)).length;
  const edited = [...now].filter(([id, claim]) => before.has(id) && before.get(id) !== claim).length;
  if (added) changes.push(`${plural(added, "card")} added`);
  if (removed) changes.push(`${plural(removed, "card")} removed`);
  if (edited) changes.push(`${plural(edited, "card")} edited`);
  return listOf(changes.length ? changes : ["quotes or connections updated"]);
}

// While the AI reads, the page stays readable (dimmed) and the AI box says what is happening and for how long.
function setReading(value, inputs) {
  reading = value;
  $("[data-panel='insights']").classList.toggle("is-reading", value);
  $("#ins-loading").classList.toggle("hidden", !value);
  $("#ai-cancel").classList.toggle("hidden", !value);
  clearInterval(loadingTimer);
  if (!value) return;
  const what = `${plural(inputs.evidence.length, "card")} and ${plural(inputs.relations.length, "connection")}`;
  $("#ins-loading-step").textContent = `Sent ${what} to OpenAI. Waiting for its read${inputs.guesses.length ? ` of ${plural(inputs.guesses.length, "part")} of your hypothesis` : ""}…`;
  const started = Date.now();
  const tick = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    $("#ins-loading-time").textContent = `${seconds}s`;
    if (seconds === 75) $("#ins-loading-step").textContent = "Still waiting for OpenAI. Large webs can take a couple of minutes; you can keep working or cancel.";
  };
  tick();
  loadingTimer = setInterval(tick, 1000);
}

function renderAiStatus(web) {
  const project = currentProject();
  const inputs = inputsForAi();
  const status = $("#ai-status");
  const button = $("#ai-analyze-button");
  const ai = currentRead(project);
  const keyMissing = noKey || pipelineStatus().state === "no-key";
  let blocked = "";
  if (keyMissing) blocked = "AI isn’t set up on this computer. Start Lattice with an OpenAI key (<code>OPENAI_API_KEY</code>) to use it. Everything else on this page works without it.";
  else if (!project.question.trim()) blocked = "Add a research question first, in Question &amp; history.";
  else if (!inputs.evidence.length) blocked = "Add a source Lattice can read (a link, file, pasted text, or capture). Links that couldn’t be fetched aren’t sent.";
  if (blocked) status.innerHTML = ai ? `Last read ${escapeHtml(relativeTime(ai.generatedAt))}, from ${plural(ai.evidenceCount, "card")}. ${blocked}` : blocked;
  else if (ai) {
    const stale = isStale(ai, project);
    status.innerHTML = `Last read ${escapeHtml(relativeTime(ai.generatedAt))}, from ${plural(ai.evidenceCount, "card")}.${stale ? ` <b>Out of date: ${escapeHtml(changesSince(ai, project, inputs) || "your web has changed")} since. Run it again to catch up.</b>` : ""}`;
  } else if (project.aiAnalysis) status.innerHTML = "<b>Your saved AI read is in an older format.</b> Run it again to fill in this page.";
  else status.textContent = `Reads ${plural(inputs.evidence.length, "card")}${web.guesses.length ? ` against ${plural(inputs.guesses.length, "part")} of your hypothesis` : ""}, using only your cards and the connections Lattice found. Nothing is sent until you run it.`;
  // Written only when it changes, so screen readers announce it once rather than on every re-render.
  const message = aiMessage?.projectId === project.id ? aiMessage : null;
  const box = $("#ins-ai-message");
  box.classList.toggle("hidden", !message);
  box.dataset.tone = message?.tone || "";
  if (box.textContent !== (message?.text || "")) box.textContent = message?.text || "";
  $("#ai-open-label").textContent = reading ? "Reading your web…" : ai ? "Run AI read again" : "Run AI read";
  if (!reading) {
    button.innerHTML = `${ai ? "Run it again" : "Run the AI read"} <span aria-hidden="true">→</span>`;
    button.disabled = Boolean(blocked) || !$("#ai-consent").checked;
  }
}

export async function analyzeEvidence() {
  const project = currentProject();
  const inputs = inputsForAi();
  if (reading || !$("#ai-consent").checked || !project.question.trim() || !inputs.evidence.length) return;
  const requestSignature = signatureOf(project, inputs);
  const button = $("#ai-analyze-button");
  button.disabled = true; button.textContent = "Reading your web…";
  aiMessage = null;
  $("#ins-ai-message").classList.add("hidden");
  setReading(true, inputs);
  controller = new AbortController();
  try {
    let response;
    try {
      response = await fetch("/api/evidence-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: project.question, hypothesis: project.hypothesis, ...inputs }), signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("Couldn’t reach the local Lattice server. Check that it is still running (npm start), then try again.");
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 503) noKey = true;
    if (!response.ok || !payload.analysis) throw new Error(payload.error || "The AI read couldn’t be completed. Try again in a moment.");
    // A server started before this version answers in the old format, which this page can't show.
    if (typeof payload.analysis.overview !== "string") throw new Error("Your local Lattice server is running an older version. Stop it, run npm start again, and retry.");
    // Kept even if the web changed meanwhile (new links keep arriving in the background); the page then says it is out of date.
    project.aiAnalysis = {
      ...payload.analysis, generatedAt: new Date().toISOString(), evidenceCount: inputs.evidence.length, signature: requestSignature,
      basis: { question: project.question, hypothesis: project.hypothesis, evidence: inputs.evidence.map(item => [item.id, item.claim]) }
    };
    recordActivity("analysis", "Ran an AI read of the evidence", `${plural(inputs.evidence.length, "card")}, ${plural(inputs.guesses.length, "guess")}, ${plural(inputs.relations.length, "relation")}`);
    saveWorkspace(); renderActivityList();
    $("#ai-dialog").close(); // the results are on the page now
    aiMessage = { projectId: project.id, tone: "note", text: inputs.guesses.length ? "Your AI read is ready. Each part below now has a written summary with the cards it rests on." : "Your AI read is ready." };
  } catch (error) {
    aiMessage = error.name === "AbortError"
      ? { projectId: project.id, tone: "note", text: "Cancelled. Nothing new was saved; your previous read, if you had one, is still here." }
      : { projectId: project.id, tone: "error", text: error.message || "The AI read couldn’t be completed. Try again in a moment." };
  } finally {
    controller = null;
    setReading(false);
    renderInsights();
  }
}
