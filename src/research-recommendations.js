// Local recommendation planning and ranking: source text never leaves the browser.
const stop = new Set("a an the and or of for to in on at by with from as is are was were be been being that this these those it its we our you your their they may can could would should will do does how what why when which whether than then into more less most study studies research paper papers effect effects influence impact using based results show shows suggest suggests significantly compared increase increases decrease decreases high higher low lower current through between during under over not no has have had also such pdf text pasted notes untitled project".split(" "));
const normal = value => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function researchTerms(value) {
  const text = normal(value);
  const vitamins = text.match(/\bvitamin [a-z]\d*\b/g) || [];
  return [...new Set([...vitamins, ...text.split(" ").filter(word => word.length > 1 && !stop.has(word) && !/^\d+$/.test(word))])].slice(0, 12);
}
export const normalizedDoi = value => String(value || "").trim().toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, "");

export function recommendationContext(project) {
  const sources = (project?.sources || []).filter(source => !source.origin || source.origin === "external").map(source => ({
    title: source.meta?.title || source.title || "",
    doi: normalizedDoi(source.meta?.doi || source.doi || source.originalUrl || source.url),
    terms: researchTerms(source.meta?.title || source.title)
  }));
  const hypothesis = String(project?.hypothesis || "").trim();
  const question = String(project?.question || "").trim();
  const focus = researchTerms(hypothesis || question);
  const plans = [];
  if (focus.length) plans.push({ label: hypothesis ? "Explore your hypothesis" : "Explore your question", detail: hypothesis || question, query: focus.slice(0, 8).join(" ") });
  for (const source of sources.filter(source => source.terms.length).slice(-3).reverse()) {
    const query = [...new Set([...focus.slice(0, 3), ...source.terms.slice(0, 5)])].join(" ");
    if (!plans.some(plan => plan.query === query)) plans.push({ label: "Build on your reading", detail: source.title, query });
  }
  return { hypothesis, question, sources, focus, plans, key: JSON.stringify([project?.id, hypothesis, question, sources]) };
}

export function rankRecommendations(candidates, context) {
  const savedDois = new Set(context.sources.map(source => source.doi));
  const savedTitles = new Set(context.sources.map(source => normal(source.title)));
  const seen = new Set();
  const matches = (text, terms) => terms.filter(term => (` ${text} `).includes(` ${term} `));
  return candidates.flatMap(paper => {
    const doi = normalizedDoi(paper.doi);
    if (!doi || seen.has(doi) || savedDois.has(doi) || savedTitles.has(normal(paper.title))) return [];
    seen.add(doi);
    const title = normal(paper.title);
    const text = `${title} ${normal(paper.abstract)}`;
    const focusMatches = matches(text, context.focus);
    const sourceMatches = context.sources.map(source => ({ source, terms: matches(text, source.terms) })).sort((a, b) => b.terms.length - a.terms.length);
    const closest = sourceMatches[0];
    const score = matches(title, context.focus).length * 4 + focusMatches.length * 2 + Math.min(closest?.terms.length || 0, 5);
    if (score < 2) return [];
    let reason;
    if (focusMatches.length) reason = `Shares ${focusMatches.slice(0, 3).join(", ")} with your ${context.hypothesis ? "hypothesis" : "question"}.`;
    else reason = `Shares ${closest.terms.slice(0, 3).join(", ")} with “${closest.source.title}”.`;
    return [{ ...paper, score, reason }];
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}
