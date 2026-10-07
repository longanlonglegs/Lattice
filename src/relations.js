// Pure helpers for relationships between ideas: similarity, candidate pairs, labels, and styles.
// No DOM or storage access, so node:test can import this module.

// How each relation reads and looks. `from`/`to` label a directed relation from each end.
export const relationTypes = {
  supports: { label: "Supports", from: "Supports", to: "Supported by", colour: "#3f7a63", dash: "", arrow: true, distance: 95, strength: 0.5 },
  contradicts: { label: "Contradicts", from: "Contradicts", to: "Contradicts", colour: "#c4473a", dash: "6 4", arrow: false, distance: 200, strength: 0.15 },
  refines: { label: "Refines", from: "Refines", to: "Refined by", colour: "#8a857c", dash: "", arrow: true, distance: 125, strength: 0.3 },
  same: { label: "Same claim", from: "Same claim as", to: "Same claim as", colour: "#85579a", dash: "", arrow: false, double: true, distance: 60, strength: 0.8 },
  explains: { label: "Explains", from: "Explains", to: "Explained by", colour: "#d07a2c", dash: "", arrow: true, distance: 125, strength: 0.3 }
};

export const shortText = (text, limit) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
};

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// One id per unordered pair of cards; `a` is always the lower card id.
export function pairId(x, y) {
  const [a, b] = [Number(x), Number(y)].sort((p, q) => p - q);
  return { id: `${a}|${b}`, a, b };
}

// For every node, its k most similar nodes above `floor`, skipping nodes in the same group
// (the same source, or the same hypothesis version). Returns unique pairs.
export function candidatePairs(nodes, { k = 8, floor = 0.3 } = {}) {
  const pairs = new Map();
  for (const node of nodes) {
    const nearest = nodes
      .filter(other => other !== node && other.group !== node.group)
      .map(other => ({ other, similarity: cosine(node.vector, other.vector) }))
      .filter(item => item.similarity >= floor)
      .sort((p, q) => q.similarity - p.similarity)
      .slice(0, k);
    for (const { other, similarity } of nearest) {
      const pair = pairId(node.id, other.id);
      if (!pairs.has(pair.id)) pairs.set(pair.id, { ...pair, similarity });
    }
  }
  return [...pairs.values()];
}

// Which card an edge points from and to. Symmetric relations have no real direction; a -> b is used.
export function edgeEnds(edge) {
  return edge.direction === "b_to_a" ? { from: edge.b, to: edge.a } : { from: edge.a, to: edge.b };
}

// How an edge reads from one of its cards: { label, otherId }.
export function describeRelation(edge, cardId) {
  const type = relationTypes[edge.relation];
  const { from, to } = edgeEnds(edge);
  const isFrom = Number(cardId) === Number(from);
  return { label: isFrom ? type.from : type.to, otherId: isFrom ? to : from };
}

// An edge only counts while both its claims are still worded as they were when it was judged.
export const edgeIsCurrent = (edge, claimA, claimB) => edge.aText === claimA && edge.bText === claimB;

// ---------- Which links the web shows ----------

// Evidence↔evidence links worth drawing: a contradiction, a repeated claim, or an explanation the model is sure of.
const IMPORTANT = new Set(["contradicts", "same", "explains"]);
const IMPORTANT_CONFIDENCE = 0.8;
const MAX_EVIDENCE_LINKS = 2; // per card

// Every link touching a hypothesis guess is shown. Links between two pieces of evidence are shown when they
// are important, or when a card has no hypothesis link at all (its strongest ones, so it isn't left floating);
// either way at most 2 per card. The rest stay listed in the side panel.
export function visibleEdges(edges, isHypothesis) {
  const touchesHypothesis = edge => isHypothesis(edge.a) || isHypothesis(edge.b);
  const anchored = new Set();
  edges.filter(touchesHypothesis).forEach(edge => { anchored.add(edge.a); anchored.add(edge.b); });
  const important = edge => IMPORTANT.has(edge.relation) && edge.confidence >= IMPORTANT_CONFIDENCE;
  const candidates = edges.filter(edge => !touchesHypothesis(edge) && (important(edge) || !anchored.has(edge.a) || !anchored.has(edge.b)))
    .sort((p, q) => important(q) - important(p) || q.confidence - p.confidence);
  const used = new Map();
  const shown = edges.filter(touchesHypothesis);
  for (const edge of candidates) {
    if ((used.get(edge.a) || 0) >= MAX_EVIDENCE_LINKS || (used.get(edge.b) || 0) >= MAX_EVIDENCE_LINKS) continue;
    used.set(edge.a, (used.get(edge.a) || 0) + 1);
    used.set(edge.b, (used.get(edge.b) || 0) + 1);
    shown.push(edge);
  }
  return shown;
}

// Pairs every idea with every current hypothesis guess, so links to the hypothesis are never missed
// just because the wording looks different.
export function hypothesisPairs(nodes) {
  const guesses = nodes.filter(node => node.hypothesis);
  return nodes.filter(node => !node.hypothesis).flatMap(node => guesses.map(guess => ({ ...pairId(node.id, guess.id), similarity: 0 })));
}

// ---------- Needs attention ----------

// What deserves a look: contradictions between pieces of evidence, drafts included (strongest first; evidence
// against a hypothesis guess is shown on the guess itself), current hypothesis guesses that no evidence supports,
// contradicts, or repeats yet, and draft claims that no external source or experiment supports.
// cards: the web's ideas; edges: their shown-or-not relations (projectEdges).
export function needsAttention(cards, edges) {
  const byId = new Map(cards.map(card => [card.id, card]));
  const other = (edge, id) => byId.get(edge.a === id ? edge.b : edge.a);
  const touching = id => edges.filter(edge => edge.a === id || edge.b === id);
  const contradictions = edges.filter(edge => edge.relation === "contradicts" && byId.has(edge.a) && byId.has(edge.b) && byId.get(edge.a).origin !== "hypothesis" && byId.get(edge.b).origin !== "hypothesis").sort((p, q) => q.confidence - p.confidence);
  const unsupportedGuesses = cards.filter(card => card.origin === "hypothesis" && !touching(card.id).some(edge => ["supports", "contradicts", "same"].includes(edge.relation) && other(edge, card.id)?.origin !== "hypothesis"));
  const isSupportFor = (edge, id) => edge.relation === "same" || (edge.relation === "supports" && edgeEnds(edge).to === id);
  const unsupportedDrafts = cards.filter(card => card.origin === "draft" && !touching(card.id).some(edge => isSupportFor(edge, card.id) && ["external", "experiment"].includes(other(edge, card.id)?.origin)));
  return { contradictions, unsupportedGuesses, unsupportedDrafts, total: contradictions.length + unsupportedGuesses.length + unsupportedDrafts.length };
}
