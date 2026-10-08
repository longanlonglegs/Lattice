// The relationship pipeline: finds how the project's ideas relate, in the background, with no button.
// 1. embed ideas that have no embedding for their current wording, 2. pick each idea's most similar
// ideas from other sources, 3. skip pairs already judged, 4. ask the AI about the rest, 20 at a time.
// Embeddings and edges are stored in IndexedDB, so a reload makes no new API calls.
import { currentProject } from "./state.js";
import { readProjectRecords, putRecords, deleteRecords } from "./db.js";
import { candidatePairs, edgeIsCurrent, hypothesisPairs } from "./relations.js";

const EMBED_BATCH = 100;
const NEAREST = 3; // most similar ideas from other sources, on top of every hypothesis guess
const RELATE_BATCH = 20;
const PARALLEL = 3; // relate calls in flight at once
const MIN_CONFIDENCE = 0.6; // weaker verdicts are kept (so they aren't asked again) but not shown
// Bumped when the judge's input or prompt changes, so pairs judged the old way are judged again, once.
// 2: the judge also reads each idea's supporting passages, not only its claim.
const JUDGE_VERSION = 2;
const EVIDENCE_CHARS = 900;
const originNames = { external: "external source", experiment: "my experiment", hypothesis: "my hypothesis" };

const graphs = new Map(); // projectId -> { embeddings: Map(cardId -> record), edges: Map(pairId -> record) }
const listeners = new Set();
let status = { projectId: null, state: "idle", left: 0 };
let timer = null;
let running = false;
let runAgain = false;

// True once a project's stored embeddings and edges have been read.
export const graphLoaded = projectId => graphs.has(projectId);

export const onPipelineChange = listener => listeners.add(listener);
const notify = () => listeners.forEach(listener => listener());
const setStatus = next => { status = next; notify(); };
export const pipelineStatus = () => status;

// The ideas that take part in the web: accepted cards, except superseded hypothesis guesses.
// Cards waiting in the review deck, and rejected ones, are left out everywhere.
export const webCards = project => project.cards.filter(item => item.state === "approved" && !item.superseded && String(item.claim || "").trim());
const groupOf = item => item.sourceId || `hypothesis:${item.versionId || ""}`;

async function graphFor(projectId) {
  if (!graphs.has(projectId)) {
    const [embeddings, edges] = await Promise.all([readProjectRecords("embeddings", projectId), readProjectRecords("edges", projectId)]);
    graphs.set(projectId, { embeddings: new Map(embeddings.map(record => [record.cardId, record])), edges: new Map(edges.map(record => [record.id, record])) });
  }
  return graphs.get(projectId);
}

// Edges between the given project's current ideas (judged "none" excluded). Loads them on first use.
export function projectEdges(project) {
  const graph = graphs.get(project.id);
  if (!graph) { graphFor(project.id).then(notify); return []; }
  const cards = new Map(webCards(project).map(item => [item.id, item]));
  return [...graph.edges.values()].filter(edge => edge.relation !== "none" && edge.confidence >= MIN_CONFIDENCE && cards.has(edge.a) && cards.has(edge.b) && edgeIsCurrent(edge, cards.get(edge.a).claim, cards.get(edge.b).claim));
}

async function post(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "request failed"); error.status = response.status; throw error; }
  return payload;
}

async function run() {
  const project = currentProject();
  if (!project) return;
  const graph = await graphFor(project.id);
  const cards = webCards(project);
  const byId = new Map(cards.map(item => [item.id, item]));

  // Forget embeddings and edges of cards that no longer exist.
  const existing = new Set(project.cards.map(item => item.id));
  const goneEmbeddings = [...graph.embeddings.values()].filter(record => !existing.has(record.cardId));
  const goneEdges = [...graph.edges.values()].filter(edge => !existing.has(edge.a) || !existing.has(edge.b));
  goneEmbeddings.forEach(record => graph.embeddings.delete(record.cardId));
  goneEdges.forEach(edge => graph.edges.delete(edge.id));
  await Promise.all([deleteRecords("embeddings", goneEmbeddings.map(record => record.id)), deleteRecords("edges", goneEdges.map(edge => edge.id))]);

  // 1. Embed ideas whose wording has no embedding yet.
  const unembedded = cards.filter(item => graph.embeddings.get(item.id)?.text !== item.claim);
  for (let start = 0; start < unembedded.length; start += EMBED_BATCH) {
    const batch = unembedded.slice(start, start + EMBED_BATCH);
    setStatus({ projectId: project.id, state: "embedding", left: unembedded.length - start, cards: unembedded.slice(start).map(item => item.id) });
    const { vectors } = await post("/api/embed", { texts: batch.map(item => item.claim) });
    const records = batch.map((item, index) => ({ id: `${project.id}:${item.id}`, projectId: project.id, cardId: item.id, text: item.claim, vector: vectors[index] }));
    records.forEach(record => graph.embeddings.set(record.cardId, record));
    await putRecords("embeddings", records);
  }

  // 2–3. Candidate pairs: every idea with every current hypothesis guess, plus its nearest ideas from other
  // sources; skipping pairs already judged for their current wording.
  const nodes = cards.map(item => ({ id: item.id, group: groupOf(item), hypothesis: item.origin === "hypothesis", vector: graph.embeddings.get(item.id).vector }));
  const candidates = new Map([...hypothesisPairs(nodes), ...candidatePairs(nodes, { k: NEAREST })].map(pair => [pair.id, pair]));
  const todo = [...candidates.values()].filter(pair => {
    const edge = graph.edges.get(pair.id);
    return !edge || edge.judge !== JUDGE_VERSION || !edgeIsCurrent(edge, byId.get(pair.a).claim, byId.get(pair.b).claim);
  });

  // 4. Judge them in batches (a few at once) and store every verdict, "none" included, so it isn't asked again.
  // An idea's evidence is its quotes. A hypothesis guess's only quote is the hypothesis sentence it came from, so it sends none.
  const evidenceOf = item => item.origin === "hypothesis" ? "" : (item.quotes || []).map(quote => quote.text?.trim()).filter(Boolean).join(" … ").slice(0, EVIDENCE_CHARS);
  const idea = item => ({ claim: item.claim, origin: originNames[item.origin] || originNames.external, ...(evidenceOf(item) ? { evidence: evidenceOf(item) } : {}) });
  const batches = [];
  for (let start = 0; start < todo.length; start += RELATE_BATCH) batches.push(todo.slice(start, start + RELATE_BATCH));
  let left = todo.length;
  const cardsIn = list => [...new Set(list.flat().flatMap(pair => [pair.a, pair.b]))];
  const judge = async batch => {
    const { results } = await post("/api/relate", { question: project.question, pairs: batch.map(pair => ({ id: pair.id, a: idea(byId.get(pair.a)), b: idea(byId.get(pair.b)) })) });
    const resultById = new Map(results.map(item => [item.id, item]));
    const edges = batch.map(pair => ({
      ...resultById.get(pair.id),
      id: pair.id, projectId: project.id, a: pair.a, b: pair.b, aText: byId.get(pair.a).claim, bText: byId.get(pair.b).claim, judge: JUDGE_VERSION, similarity: Math.round(pair.similarity * 1000) / 1000
    }));
    edges.forEach(edge => graph.edges.set(edge.id, edge));
    await putRecords("edges", edges);
    left -= batch.length;
    batch.done = true;
    setStatus({ projectId: project.id, state: "relating", left, cards: cardsIn(batches.filter(batch => !batch.done)) });
  };
  if (todo.length) setStatus({ projectId: project.id, state: "relating", left, cards: cardsIn(batches) });
  for (let start = 0; start < batches.length; start += PARALLEL) await Promise.all(batches.slice(start, start + PARALLEL).map(judge));
  setStatus({ projectId: project.id, state: "done", left: 0 });
}

async function runSafely() {
  if (running) { runAgain = true; return; }
  running = true;
  try {
    await run();
  } catch (error) {
    console.warn("Relationship pipeline paused:", error.message);
    setStatus({ projectId: currentProject()?.id || null, state: error.status === 503 ? "no-key" : "error", left: 0 });
  } finally {
    running = false;
    if (runAgain) { runAgain = false; schedulePipeline(); }
  }
}

// Runs the pipeline shortly after things stop changing. Cheap when there is nothing to do.
export function schedulePipeline(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(runSafely, delay);
}

// After a restore or delete, the stored embeddings and edges may have changed underneath the cache.
export function resetPipeline() {
  graphs.clear();
  status = { projectId: null, state: "idle", left: 0 };
}

// Removes a deleted project's embeddings and edges.
export async function forgetProject(projectId) {
  const [embeddings, edges] = await Promise.all([readProjectRecords("embeddings", projectId), readProjectRecords("edges", projectId)]);
  graphs.delete(projectId);
  await Promise.all([deleteRecords("embeddings", embeddings.map(record => record.id)), deleteRecords("edges", edges.map(record => record.id))]);
}
