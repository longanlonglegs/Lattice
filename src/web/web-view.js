// The idea web: the project's ideas as cards on a pannable canvas. Hypothesis guesses are large hub cards on a
// ring in the middle; each piece of evidence gathers around the guess it bears on most. Uses d3 (a global).
import { $, escapeHtml, plural, toast, confirmDialog } from "../util.js";
import { currentProject, persist } from "../state.js";
import { origins, originOf } from "../origins.js";
import { graphLoaded, pipelineStatus, projectEdges, webCards } from "../pipeline.js";
import { relationTypes, describeRelation, edgeEnds, shortText, visibleEdges } from "../relations.js";
import { shortCitation } from "../records.js";
import { renderAttention, setAttentionOpen } from "./attention.js";
import { pendingCards, requestReview } from "../review.js";
import { icon } from "../icons.js";

const d3 = window.d3;
const SIZE = { hub: [390, 195], card: [273, 120] }; // fallback sizes until a card has been measured
const hidden = { origins: new Set(), relations: new Set() };
let web = null; // { projectId, simulation, nodes: Map, links: [], zoom, selectedId, signature, fitted }
let searchTerm = "";
let showAll = false;
// "cards" shows every idea as a card; "nodes" shows each as a shape sized by how connected it is.
let viewMode = (() => { try { return localStorage.getItem("lattice-web-view") === "nodes" ? "nodes" : "cards"; } catch { return "cards"; } })();

const isHub = node => node.card.origin === "hypothesis";

// ---------- Setup ----------

function createWeb(project) {
  web?.simulation.stop();
  $("#web-cards").innerHTML = "";
  $("#web-stickies").innerHTML = "";
  const svg = d3.select("#web-svg");
  svg.selectAll("*").remove();
  const defs = svg.append("defs");
  for (const [key, type] of Object.entries(relationTypes)) {
    if (!type.arrow) continue;
    defs.append("marker").attr("id", `arrow-${key}`).attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L10,0L0,4").attr("fill", type.colour);
  }
  svg.append("g").attr("class", "web-links");

  const canvas = d3.select("#web-canvas");
  const zoom = d3.zoom().scaleExtent([0.15, 2.5])
    // Scrolling or pinching zooms the web wherever the pointer is, cards included; only the side panel and the
    // attention list keep their own scrolling. Pressing on a card drags the card instead of panning.
    .filter(event => !event.target.closest?.(event.type === "wheel" ? ".web-side, .web-attention" : ".web-card, .web-side, .web-sticky, .web-attention") && (!event.ctrlKey || event.type === "wheel") && !event.button)
    .on("zoom", event => {
      const { x, y, k } = event.transform;
      $("#web-world").style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      $("#web-zoom-level").textContent = `${Math.round(k * 100)}%`;
      // Nodes view: shapes and labels partly counter the zoom, so they stay legible when the whole web is in view.
      $("#web-canvas").style.setProperty("--zoom-inv", Math.min(3, Math.max(1, (1 / k) ** 0.7)).toFixed(3));
    });
  canvas.call(zoom).on("dblclick.zoom", null);
  canvas.on("click", event => { if (!event.target.closest(".web-card, .web-side, .web-sticky, .web-attention")) select(null); });
  canvas.on("dblclick", event => {
    if (event.target.closest(".web-card, .web-side, .web-sticky, .web-attention")) return;
    const [x, y] = d3.zoomTransform(canvas.node()).invert(d3.pointer(event, canvas.node()));
    addSticky(x - STICKY_W / 2, y - 20);
  });

  const simulation = d3.forceSimulation()
    // The layout (placeTargets) decides where everything goes; the simulation eases cards there and clears any
    // overlap. Links carry no force, so a long connection can't drag a card out of its group.
    .force("target-x", d3.forceX(node => node.target?.x ?? 0).strength(node => node.target ? 0.1 : 0.02))
    .force("target-y", d3.forceY(node => node.target?.y ?? 0).strength(node => node.target ? 0.1 : 0.02))
    // Every card pushes every other card away a little, so the web spreads out evenly instead of bunching.
    .force("spread", d3.forceManyBody().strength(-900).distanceMin(60).distanceMax(650))
    .force("link", d3.forceLink().id(node => node.id).strength(0))
    .force("collide", rectCollide(14))
    .force("edge-avoid", edgeAvoid(16))
    .alphaDecay(0.05)
    .on("tick", tick)
    .on("end", () => { savePositions(); if (!web.fitted) { web.fitted = true; fit(false); } });
  web = { projectId: project.id, simulation, nodes: new Map(), links: [], zoom, selectedId: null, signature: "", fitted: false, mode: viewMode };
  $("#web-canvas").classList.toggle("nodes-mode", viewMode === "nodes");
}

// Keeps cards from overlapping: pushes apart any two whose rectangles (plus padding) intersect,
// along the axis where they overlap least. Fixed cards (hubs, pinned cards) don't move.
function rectCollide(padding) {
  let nodes = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.w + b.w) / 2 + padding - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + padding - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const aFixed = a.fx != null, bFixed = b.fx != null;
        if (aFixed && bFixed) continue;
        const shareA = aFixed ? 0 : bFixed ? 1 : 0.5;
        if (ox < oy) { const push = ox * (dx < 0 ? -1 : 1); a.x -= push * shareA; b.x += push * (1 - shareA); }
        else { const push = oy * (dy < 0 ? -1 : 1); a.y -= push * shareA; b.y += push * (1 - shareA); }
      }
    }
  };
  force.initialize = list => { nodes = list; };
  return force;
}

// ---------- Layout targets ----------

// Each hypothesis guess is the centre of its own cluster, with the evidence that bears on it most in rings around it.
// The layout works to keep connections from crossing cards and each other:
//  - clusters that share many connections sit next to each other on the circle, so long links stay short;
//  - inside a cluster, evidence that also connects elsewhere takes the slot facing what it connects to; the rest keep
//    supporting evidence on the left and contradicting evidence on the right;
//  - alternate rings are staggered by half a slot, so spokes to the outer ring pass between inner cards.
// Ring spacing comes from the real card (or node) size, so nothing overlaps. Evidence with no link to the hypothesis
// sits on an outer band, grouped by source.
const SIDE_ORDER = { supports: 0, same: 0, explains: 1, refines: 1, contradicts: 2 };
const SIDE_ANGLE = [Math.PI, Math.PI / 2, 0]; // for: left, conditions/causes: below, against: right
function placeTargets(project) {
  const nodes = [...web.nodes.values()];
  const hubs = nodes.filter(isHub).sort((a, b) => a.id - b.id);
  const evidence = nodes.filter(node => !isHub(node));
  // The cards view and the nodes view share one layout, computed from card sizes (remembered from the cards view),
  // so switching views never moves anything. SPREAD sets how much breathing room every distance gets.
  const SPREAD = 1.5;
  // Spacing is planned from fixed card sizes, not the drawn ones, so making cards bigger doesn't spread the web.
  const PLAN = { hub: [300, 150], card: [210, 92] };
  const cardW = PLAN.card[0];
  const cardH = PLAN.card[1];
  const slot = (cardW + 24) * SPREAD;
  const depth = (cardH + 40) * SPREAD;
  const hubReach = (Math.max(120, Math.max(...PLAN.hub) / 2) + 30) * SPREAD;
  const gap = 100 * SPREAD;
  const stretch = Math.max(1, cardW / cardH) * 0.62;
  const links = web.links.filter(link => typeof link.source === "object");
  // In the nodes view the first ring sits far enough out (hubReach) that a hub's label fits inside it.
  const around = 2 * Math.PI;
  const ringAround = () => around;

  // Home: the guess each piece of evidence is most confidently linked to.
  const home = new Map();
  for (const link of links) {
    const [hub, other] = isHub(link.source) ? [link.source, link.target] : isHub(link.target) ? [link.target, link.source] : [null, null];
    if (!hub || isHub(other)) continue;
    const best = home.get(other.id);
    if (!best || link.edge.confidence > best.confidence) home.set(other.id, { hub, confidence: link.edge.confidence, relation: link.edge.relation });
  }
  const members = new Map(hubs.map(hub => [hub.id, []]));
  const loose = [];
  for (const node of evidence) {
    const entry = home.get(node.id);
    node.home = entry?.hub.id ?? null;
    node.side = entry ? SIDE_ORDER[entry.relation] ?? 1 : 1;
    if (entry) members.get(entry.hub.id).push(node); else loose.push(node);
  }
  const clusterOf = node => (isHub(node) ? node.id : node.home);

  // Ring capacities per cluster (they depend only on how many members there are).
  const ringsFor = count => {
    const rings = [];
    let left = count, radius = hubReach + depth / 2;
    while (left > 0) {
      const capacity = Math.max(1, Math.floor((ringAround(rings.length) * radius * Math.min(stretch, 1.4)) / slot));
      rings.push({ radius, capacity: Math.min(capacity, left) });
      left -= capacity;
      radius += depth;
    }
    return rings;
  };
  const shapes = new Map(hubs.map(hub => {
    const rings = ringsFor(members.get(hub.id).length);
    const outer = rings.length ? rings[rings.length - 1].radius : hubReach;
    const reach = Math.max(hubReach * stretch, outer * stretch + cardW / 2, outer + cardH / 2);
    return [hub.id, { rings, reach }];
  }));

  // Order the clusters round the circle so the pairs with the most connections between them are neighbours.
  const affinity = new Map();
  for (const link of links) {
    const a = clusterOf(link.source), b = clusterOf(link.target);
    if (a == null || b == null || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    affinity.set(key, (affinity.get(key) || 0) + link.edge.confidence);
  }
  const n = hubs.length;
  let order = hubs.map(hub => hub.id);
  if (n > 3 && n <= 7) {
    const cost = ids => {
      let total = 0;
      for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
        const steps = Math.min(j - i, ids.length - (j - i));
        total += (affinity.get(ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`) || 0) * steps;
      }
      return total;
    };
    const permute = (rest, prefix, best) => {
      if (!rest.length) { const c = cost(prefix); if (c < best.cost) { best.cost = c; best.ids = prefix; } return best; }
      rest.forEach((id, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, id], best));
      return best;
    };
    order = permute(order.slice(1), [order[0]], { cost: Infinity, ids: order }).ids;
  }
  const biggest = Math.max(0, ...[...shapes.values()].map(shape => shape.reach));
  const ring = n > 1 ? (biggest + gap / 2) / Math.sin(Math.PI / n) : 0;
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  const centre = new Map();
  order.forEach((id, index) => {
    const angle = start + (2 * Math.PI * index) / Math.max(1, n);
    centre.set(id, { x: Math.cos(angle) * ring * (n > 2 ? 1.12 : 1), y: Math.sin(angle) * ring * (n > 2 ? 0.88 : 1) });
  });

  // Inside each cluster: give each member the free slot closest to the direction it wants to face.
  for (const hub of hubs) {
    const c = centre.get(hub.id);
    hub.target = { ...c };
    if (!hub.pinned) { hub.fx = c.x; hub.fy = c.y; }
    const slots = [];
    shapes.get(hub.id).rings.forEach(({ radius, capacity }, k) => {
      const full = Math.max(capacity, Math.floor((ringAround(k) * radius * Math.min(stretch, 1.4)) / slot));
      const step = ringAround(k) / full;
      const offset = k % 2 ? step / 2 : 0; // stagger alternate rings by half a slot
      // Slots run clockwise from straight down, all the way round.
      for (let i = 0; i < full; i += 1) slots.push({ ring: k, radius, angle: Math.PI / 2 + offset + step * (i + 0.5), used: false });
    });
    const wants = members.get(hub.id).map(node => {
      let vx = 0, vy = 0, pull = 0;
      for (const link of links) {
        const other = link.source === node ? link.target : link.target === node ? link.source : null;
        if (!other || clusterOf(other) === hub.id) continue;
        const target = centre.get(clusterOf(other));
        if (!target) continue;
        const dx = target.x - c.x, dy = target.y - c.y, len = Math.hypot(dx, dy) || 1;
        vx += (dx / len) * link.edge.confidence; vy += (dy / len) * link.edge.confidence; pull += link.edge.confidence;
      }
      const angle = pull ? Math.atan2(vy, vx) : SIDE_ANGLE[node.side];
      return { node, angle, pull, confidence: home.get(node.id).confidence };
    });
    // Strongly pulled members choose first, then the most confident; inner rings fill before outer ones.
    wants.sort((p, q) => q.pull - p.pull || q.confidence - p.confidence || p.node.id - q.node.id);
    const capacityLeft = shapes.get(hub.id).rings.map(r => r.capacity);
    for (const want of wants) {
      const ringIndex = capacityLeft.findIndex(left => left > 0);
      let best = null;
      for (const s of slots) {
        if (s.used || s.ring !== ringIndex) continue;
        const diff = Math.abs(Math.atan2(Math.sin(s.angle - want.angle), Math.cos(s.angle - want.angle)));
        if (!best || diff < best.diff) best = { s, diff };
      }
      best.s.used = true;
      capacityLeft[ringIndex] -= 1;
      want.node.target = { x: c.x + Math.cos(best.s.angle) * best.s.radius * stretch, y: c.y + Math.sin(best.s.angle) * best.s.radius };
    }
  }

  // Evidence with no hypothesis link: an outer band, grouped by source, spaced by the same slot.
  const sources = project.sources.map(source => source.id);
  const sorted = loose.sort((a, b) => sources.indexOf(a.card.sourceId) - sources.indexOf(b.card.sourceId) || a.id - b.id);
  const band = Math.max((n ? ring + biggest : 0) + depth, (sorted.length * slot) / (2 * Math.PI));
  sorted.forEach((node, index) => {
    const a = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, sorted.length);
    node.target = { x: Math.cos(a) * band * 1.2, y: Math.sin(a) * band * 0.85 };
  });
}

// Keeps connections from running through cards: any card a straight link passes over (other than its two ends) is
// nudged off the line, sideways. Pinned and fixed cards stay put.
function edgeAvoid(margin) {
  let nodes = [];
  const force = alpha => {
    for (const link of web?.links || []) {
      const a = link.source, b = link.target;
      if (typeof a !== "object" || typeof b !== "object") continue;
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      const len = Math.sqrt(len2), nx = -dy / len, ny = dx / len;
      for (const node of nodes) {
        if (node === a || node === b || node.fx != null) continue;
        const t = ((node.x - a.x) * dx + (node.y - a.y) * dy) / len2;
        if (t <= 0.02 || t >= 0.98) continue;
        const offset = (node.x - a.x) * nx + (node.y - a.y) * ny; // signed distance from the line
        const half = (Math.abs(nx) * node.w + Math.abs(ny) * node.h) / 2 + margin; // the card's half-width across it
        if (Math.abs(offset) >= half) continue;
        const push = (half - Math.abs(offset)) * alpha * 1.2 * (offset < 0 ? -1 : 1);
        node.x += nx * push; node.y += ny * push;
      }
    }
  };
  force.initialize = list => { nodes = list; };
  return force;
}

// ---------- Rendering ----------

// Before the web has any accepted ideas: the project's starting point. The question, the hypothesis as the dark card
// everything will gather around, and what Lattice is doing with it right now, so a new project never opens on a blank.
function renderStart(project) {
  const start = $("#web-start");
  const hasStart = Boolean(project.question || project.hypothesis);
  start.classList.toggle("hidden", !hasStart);
  $("#web-empty").classList.toggle("is-start", hasStart);
  $("#web-empty").classList.toggle("has-review", hasStart && pendingCards(project).length > 0);
  $("#web-title").textContent = hasStart ? "Your starting point" : "Add evidence to start your web";
  $("#web-empty-text").textContent = hasStart
    ? "Everything you add gathers around your hypothesis, with lines showing what supports it, contradicts it, or adds a condition."
    : "Every claim from your sources, experiments, and hypothesis appears here as an idea, with lines showing how they relate.";
  if (!hasStart) { start.innerHTML = ""; return; }
  const guesses = project.cards.filter(item => item.origin === "hypothesis" && !item.superseded);
  const waiting = pendingCards(project);
  const waitingGuesses = waiting.filter(item => item.origin === "hypothesis").length;
  const waitingEvidence = waiting.length - waitingGuesses;
  const sources = project.sources.length;
  const it = n => n === 1 ? "it" : "them";
  const status = [];
  if (project.hypothesis && !guesses.length) status.push(["working", "Splitting your hypothesis into parts you can test, one claim each."]);
  if (waitingGuesses) status.push(["ready", `${plural(waitingGuesses, "part")} of your hypothesis ${waitingGuesses === 1 ? "is" : "are"} ready. Accept ${it(waitingGuesses)} to put ${it(waitingGuesses)} at the centre of your web.`]);
  if (waitingEvidence) status.push(["ready", `${plural(waitingEvidence, "card")} from what you added ${waitingEvidence === 1 ? "is" : "are"} waiting for review.`]);
  else if (sources) status.push(["working", `Reading ${plural(sources, "source")} you added. Cards appear for review as each one finishes.`]);
  if (!project.hypothesis) status.push(["todo", "No hypothesis yet. Add one in Question & history when you have a guess; evidence will gather around it."]);
  if (!sources) status.push(["todo", "Next: add a paper, a link, or your own notes with + Add evidence."]);
  start.innerHTML = `
    ${project.question ? `<div class="web-start-question"><p class="web-start-label">Your question</p><p>${escapeHtml(project.question)}</p></div>` : ""}
    ${project.hypothesis ? `<div class="web-start-hub"><p class="web-start-kicker">Your hypothesis</p><p>${escapeHtml(project.hypothesis)}</p></div>` : ""}
    <ul class="web-start-status">${status.map(([state, text]) => `<li data-state="${state}"><i aria-hidden="true"></i><span>${escapeHtml(text)}</span></li>`).join("")}</ul>
    ${waiting.length ? `<button class="primary web-start-review" type="button">Review ${plural(waiting.length, "card")} now</button>` : ""}`;
  start.querySelector(".web-start-review")?.addEventListener("click", requestReview);
}

export function renderWeb() {
  if (!d3) {
    $("#web-title").textContent = "The idea web couldn’t load";
    $("#web-empty p").textContent = "Its drawing library (d3) is missing. Run npm install in the Lattice folder, restart the server, and reload this page.";
    return;
  }
  const project = currentProject();
  const cards = webCards(project);
  $("#web-empty").classList.toggle("hidden", cards.length > 0);
  $("#web-stage").classList.toggle("hidden", !cards.length);
  if (!cards.length) { web?.simulation.stop(); renderStart(project); return; }
  if (!web || web.projectId !== project.id) createWeb(project);

  const ids = new Set(cards.map(item => item.id));
  let changed = false;
  for (const id of [...web.nodes.keys()]) if (!ids.has(id)) { web.nodes.delete(id); changed = true; }
  for (const card of cards) {
    const node = web.nodes.get(card.id);
    if (node) { node.card = card; continue; }
    const saved = project.webLayout?.[card.id];
    const [w, h] = SIZE[card.origin === "hypothesis" ? "hub" : "card"];
    const angle = Math.random() * Math.PI * 2;
    web.nodes.set(card.id, { id: card.id, card, w, h, fresh: !saved, x: saved ? saved[0] : Math.cos(angle) * 300, y: saved ? saved[1] : Math.sin(angle) * 220, pinned: Boolean(saved?.[2]), fx: saved?.[2] ? saved[0] : null, fy: saved?.[2] ? saved[1] : null });
    changed = true;
  }

  const all = projectEdges(project);
  const hub = id => web.nodes.get(id)?.card.origin === "hypothesis";
  const shown = showAll ? all : visibleEdges(all, hub);
  const signature = `${showAll}|${shown.map(edge => `${edge.id}:${edge.relation}`).sort().join(",")}`;
  if (signature !== web.signature) { web.signature = signature; changed = true; }

  if (changed) {
    web.links = shown.map(edge => ({ edge, ...edgeEnds(edge), source: edgeEnds(edge).from, target: edgeEnds(edge).to }));
    const nodes = [...web.nodes.values()];
    web.simulation.nodes(nodes);
    web.simulation.force("link").links(web.links);
    placeTargets(project);
    // New cards start at their spot instead of somewhere they'd have to push past a hub to reach it.
    for (const node of nodes) {
      if (!node.fresh || !node.target || !graphLoaded(project.id)) continue; // wait until the edges are known
      node.x = node.target.x + (Math.random() - 0.5) * 20;
      node.y = node.target.y + (Math.random() - 0.5) * 20;
      node.fresh = false;
      web.fitted = false; // new cards: fit the view again once the layout settles, so they are on screen
    }
    web.simulation.force("target-x").initialize(nodes);
    web.simulation.force("target-y").initialize(nodes);
    const settled = nodes.every(node => project.webLayout?.[node.id]) && !web.started;
    web.simulation.alpha(settled ? 0.08 : 0.6).restart();
    web.started = true;
  } else {
    const byId = new Map(all.map(edge => [edge.id, edge]));
    web.links.forEach(link => { link.edge = byId.get(link.edge.id) || link.edge; });
  }
  drawCards();
  drawLinks();
  renderStickies();
  renderLegend();
  renderAttention();
  renderUpdating();
  if (web.selectedId && !web.nodes.has(web.selectedId)) select(null); else renderSide();
}

const noteIcon = card => card.note?.trim() ? `<span class="wc-note" title="${escapeHtml(card.note)}">${icon("edit")}</span>` : "";

function cardHtml(node) {
  const card = node.card;
  if (isHub(node)) {
    const tally = { for: 0, against: 0 };
    web.links.forEach(link => {
      if (link.to !== node.id && link.from !== node.id) return;
      if (link.edge.relation === "contradicts") tally.against += 1;
      else if (link.edge.relation === "supports" || link.edge.relation === "same") tally.for += 1;
    });
    return `<p class="wc-kicker">My hypothesis · ${escapeHtml(card.quotes?.[0]?.location?.replace(/^Hypothesis /, "") || "")}${noteIcon(card)}</p>
      <p class="wc-text">${escapeHtml(card.claim)}</p>
      <p class="wc-tally"><span class="for">${tally.for} for</span><span class="against">${tally.against} against</span></p>`;
  }
  const source = currentProject().sources.find(item => item.id === card.sourceId);
  const citation = shortCitation(source?.meta) || shortText(source?.meta?.title || source?.title || "", 28);
  return `<p class="wc-kicker"><span class="wc-dot"></span>${escapeHtml(originOf(card.origin).short)}${citation ? ` · ${escapeHtml(citation)}` : ""}${noteIcon(card)}</p>
    <p class="wc-text">${escapeHtml(card.short || shortText(card.claim, 95))}</p>`;
}

// How much an idea matters to the web: the confidence-weighted count of its connections (all of them, not only the
// drawn ones). Drives node size and the halo in the nodes view.
function importance() {
  const score = new Map();
  for (const edge of projectEdges(currentProject())) for (const id of [edge.a, edge.b]) score.set(id, (score.get(id) || 0) + edge.confidence);
  return score;
}

function drawCards() {
  const nodes = [...web.nodes.values()];
  const score = importance();
  const top = Math.max(1, ...score.values());
  const ranked = [...score.values()].sort((a, b) => b - a);
  const keyLine = ranked[Math.max(0, Math.ceil(ranked.length * 0.2) - 1)] ?? Infinity; // top fifth gets a halo
  const diameter = node => {
    const share = Math.sqrt((score.get(node.id) || 0) / top);
    return Math.round((isHub(node) ? 64 + share * 44 : 22 + share * 62) * 0.8);
  };
  d3.select("#web-cards").selectAll("div.web-card").data(nodes, node => node.id)
    .join(enter => enter.append("div").attr("class", "web-card").each(function (node) { bindCard(this, node); }))
    .attr("data-origin", node => node.card.origin)
    .classed("hub", isHub)
    .classed("pinned", node => node.pinned)
    .classed("filtered", node => hidden.origins.has(node.card.origin))
    .style("--origin", node => originOf(node.card.origin).colour)
    .style("--d", node => `${diameter(node)}px`)
    .classed("key", node => (score.get(node.id) || 0) >= keyLine && (score.get(node.id) || 0) > 0)
    .attr("title", node => node.card.claim)
    .each(function (node) {
      const html = cardHtml(node);
      if (this.dataset.html !== html) { this.innerHTML = html; this.dataset.html = html; }
      // Measure once the card is visible (the Web tab may be hidden); until then the default size is used.
      if (this.offsetWidth) {
        node.w = this.offsetWidth; node.h = this.offsetHeight;
      }
    });
  applySearch();
  highlight(web.selectedId);
  tick();
}

function bindCard(element, node) {
  const canvas = $("#web-canvas");
  let offset = null;
  d3.select(element).call(d3.drag().container(() => canvas).subject(event => ({ x: event.x, y: event.y })) // raw pointer; converted to web coordinates below
   
    .on("start", event => {
      const [x, y] = d3.zoomTransform(canvas).invert([event.x, event.y]);
      offset = [node.x - x, node.y - y];
      if (!event.active) web.simulation.alphaTarget(0.15).restart();
      node.fx = node.x; node.fy = node.y;
    })
    .on("drag", event => {
      const [x, y] = d3.zoomTransform(canvas).invert([event.x, event.y]);
      node.fx = x + offset[0]; node.fy = y + offset[1];
    })
    .on("end", event => {
      if (!event.active) web.simulation.alphaTarget(0);
      node.pinned = true;
      d3.select(element).classed("pinned", true);
      savePositions(); renderSide();
    }));
  element.addEventListener("click", event => { event.stopPropagation(); select(node.id); });
  element.addEventListener("dblclick", event => {
    event.stopPropagation();
    node.pinned = false;
    // Hubs go back to their place on the ring; evidence is free to move again.
    if (isHub(node) && node.target) { node.fx = node.target.x; node.fy = node.target.y; } else { node.fx = null; node.fy = null; }
    d3.select(element).classed("pinned", false);
    web.simulation.alpha(0.3).restart(); savePositions(); renderSide();
  });
  element.addEventListener("mouseenter", () => { highlight(node.id); showPeek(node); });
  element.addEventListener("mouseleave", () => { highlight(web.selectedId); showPeek(null); });
}

// In the nodes view, hovering a node shows its card on the right: the full claim, where it came from, its first
// quote, and how many connections it has. Hidden again when the pointer leaves, and never in the cards view.
function showPeek(node) {
  const peek = $("#web-peek");
  if (!node || web.mode !== "nodes") { peek.classList.add("hidden"); return; }
  const card = node.card;
  const source = currentProject().sources.find(item => item.id === card.sourceId);
  const citation = isHub(node) ? "" : shortCitation(source?.meta) || source?.title || "";
  const quote = !isHub(node) && card.quotes?.find(item => item.text?.trim());
  const links = web.links.filter(link => link.from === node.id || link.to === node.id);
  const counts = Object.entries(links.reduce((tally, link) => ({ ...tally, [link.edge.relation]: (tally[link.edge.relation] || 0) + 1 }), {}));
  peek.style.setProperty("--origin", originOf(card.origin).colour);
  peek.classList.toggle("hub", isHub(node));
  peek.innerHTML = `
    <p class="peek-kicker"><span class="legend-shape" data-origin="${card.origin}" style="--origin:${originOf(card.origin).colour}"></span>${escapeHtml(originOf(card.origin).label)}${citation ? ` · ${escapeHtml(citation)}` : ""}</p>
    <p class="peek-claim">${escapeHtml(card.claim)}</p>
    ${quote ? `<blockquote class="peek-quote">“${escapeHtml(shortText(quote.text, 220))}”${quote.location ? `<cite>${escapeHtml(quote.location)}</cite>` : ""}</blockquote>` : ""}
    ${counts.length ? `<p class="peek-links">${counts.map(([relation, count]) => `<span>${lineSwatch(relationTypes[relation])}${count} ${escapeHtml(relationTypes[relation].label.toLowerCase())}</span>`).join("")}</p>` : ""}
    <p class="peek-hint">Click to open it in the side panel</p>`;
  peek.classList.remove("hidden");
}

function drawLinks() {
  const groups = d3.select("#web-svg .web-links").selectAll("g.web-link").data(web.links, link => link.edge.id)
    .join(enter => {
      const group = enter.append("g").attr("class", "web-link");
      group.append("path").attr("class", "link-main");
      group.append("path").attr("class", "link-inner");
      group.append("title");
      return group;
    });
  // A card's links to hubs other than its home are drawn faintly; hovering or selecting brings them back.
  const secondary = link => (isHub(link.source) && link.target.home !== link.source.id) || (isHub(link.target) && link.source.home !== link.target.id);
  groups.attr("data-relation", link => link.edge.relation)
    .classed("secondary", link => typeof link.source === "object" && !(isHub(link.source) && isHub(link.target)) && secondary(link))
    .classed("filtered", link => hidden.relations.has(link.edge.relation) || hidden.origins.has(link.source.card?.origin) || hidden.origins.has(link.target.card?.origin));
  groups.select(".link-main")
    .attr("stroke", link => relationTypes[link.edge.relation].colour)
    .attr("stroke-width", link => (relationTypes[link.edge.relation].double ? 3 : 1) + link.edge.confidence * (web.mode === "nodes" ? 3.5 : 2.5))
    // Confidence also sets how strongly a line reads: shaky links recede.
    .attr("stroke-opacity", link => 0.35 + link.edge.confidence * 0.65)
    .attr("stroke-dasharray", link => relationTypes[link.edge.relation].dash || null)
    .attr("marker-end", link => relationTypes[link.edge.relation].arrow ? `url(#arrow-${link.edge.relation})` : null);
  groups.select(".link-inner").attr("display", link => relationTypes[link.edge.relation].double ? null : "none").attr("stroke-width", 1.4);
  groups.select("title").text(link => `${relationTypes[link.edge.relation].label}: ${link.edge.rationale}`);
  highlight(web.selectedId);
  tick();
}

// The point where the line from a card's centre towards (x, y) leaves the card.
function borderPoint(node, x, y, gap) {
  const dx = x - node.x, dy = y - node.y;
  const scale = Math.min((node.w / 2 + gap) / Math.abs(dx || 1e-6), (node.h / 2 + gap) / Math.abs(dy || 1e-6), 1);
  return [node.x + dx * scale, node.y + dy * scale];
}

function tick() {
  if (!web) return;
  d3.select("#web-svg").selectAll("g.web-link").each(function (link) {
    const { source, target } = link;
    if (!source || typeof source !== "object") return;
    const [x1, y1] = borderPoint(source, target.x, target.y, 3);
    const [x2, y2] = borderPoint(target, source.x, source.y, relationTypes[link.edge.relation].arrow ? 6 : 3);
    // Links to a hypothesis run straight (they read as spokes); links between two pieces of evidence bow
    // sideways, always to the same side for the same pair, so they don't run through the cards in between.
    let d = `M${x1},${y1}L${x2},${y2}`;
    if (!isHub(source) && !isHub(target)) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
      // Bow outward, away from the middle of the web, so curves don't cut across the centre.
      const outward = (-(y2 - y1) * mx + (x2 - x1) * my) >= 0 ? 1 : -1;
      const bend = Math.min(80, len * 0.18) * outward;
      d = `M${x1},${y1}Q${mx - ((y2 - y1) / len) * bend},${my + ((x2 - x1) / len) * bend} ${x2},${y2}`;
    }
    d3.select(this).selectAll("path").attr("d", d);
  });
  d3.select("#web-cards").selectAll("div.web-card").style("transform", node => `translate(${node.x - node.w / 2}px, ${node.y - node.h / 2}px)`);
}

// While the pipeline re-reads ideas or judges new pairs (after an import or an edited claim), a banner says so
// and the cards involved pulse. The web stays usable meanwhile.
// While the pipeline works on this project, a loading screen covers the canvas. The bar fills as the
// remaining count falls; the largest count seen in this run is the 100% mark.
let loadingTotal = 0;
function renderUpdating() {
  const status = pipelineStatus();
  const busy = web && status.projectId === web.projectId && (status.state === "embedding" || status.state === "relating");
  $("#web-loading").classList.toggle("hidden", !busy);
  if (!busy) loadingTotal = 0;
  else {
    const reading = status.state === "embedding";
    if (reading || status.left > loadingTotal) loadingTotal = reading ? 0 : status.left;
    $("#web-loading-title").textContent = reading ? "Reading your ideas" : "Connecting your ideas";
    $("#web-loading-detail").textContent = reading ? `${plural(status.left, "idea")} to read` : `${plural(status.left, "pair")} left to check`;
    const done = reading || !loadingTotal ? 0 : 1 - status.left / loadingTotal;
    $("#web-loading-progress").style.width = `${Math.round(5 + done * 95)}%`;
  }
  const involved = new Set(busy ? status.cards || [] : []);
  d3.select("#web-cards").selectAll("div.web-card").classed("updating", node => involved.has(node.id));
}

// ---------- Interaction ----------

function neighbours(id) {
  const ids = new Set([id]);
  web.links.forEach(link => { if (link.from === id) ids.add(link.to); if (link.to === id) ids.add(link.from); });
  return ids;
}

function highlight(id) {
  const near = id ? neighbours(id) : null;
  if (id && web.pair?.[0] === id) web.pair.forEach(pairId => near.add(pairId));
  d3.select("#web-canvas").classed("focused", Boolean(id));
  d3.select("#web-cards").selectAll("div.web-card").classed("near", node => Boolean(near?.has(node.id))).classed("selected", node => node.id === web.selectedId);
  d3.select("#web-svg").selectAll("g.web-link").classed("near", link => Boolean(id) && (link.from === id || link.to === id));
}

export function select(id, center = false) {
  if (!web) return;
  web.pair = null;
  web.selectedId = id;
  highlight(id);
  renderSide();
  const node = id && web.nodes.get(id);
  if (node && center) d3.select("#web-canvas").transition().duration(450).call(web.zoom.translateTo, node.x, node.y);
}

// Selects the first of two ideas, keeps both lit, and zooms to show them together (used by "Needs attention").
export function focusPair(a, b) {
  if (!web || !web.nodes.has(a) || !web.nodes.has(b)) return;
  select(a);
  web.pair = [a, b];
  highlight(a);
  fit(true, [web.nodes.get(a), web.nodes.get(b)]);
}

function fit(animate = true, only = null) {
  if (!web?.nodes.size) return;
  const canvas = $("#web-canvas");
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) { web.fitted = false; return; }
  // Cards and sticky notes, as boxes of { x, y } centre and size.
  const boxes = only || [...web.nodes.values(), ...(currentProject().stickies || []).map(sticky => ({ x: sticky.x + STICKY_W / 2, y: sticky.y + STICKY_H / 2, w: STICKY_W, h: STICKY_H }))];
  const x0 = d3.min(boxes, box => box.x - box.w / 2), x1 = d3.max(boxes, box => box.x + box.w / 2);
  const y0 = d3.min(boxes, box => box.y - box.h / 2), y1 = d3.max(boxes, box => box.y + box.h / 2);
  // Frame the web inside the space the floating chrome leaves: the legend panel on the left, the toolbar along the
  // bottom, and the side panel on the right when zooming to a pair. Below 900px the chrome stacks outside the canvas.
  const floating = width > 900;
  // The tab island floats over the right edge on wide screens.
  const left = floating ? 290 : 16, right = (only ? 380 : 24) + (floating ? 96 : 0), top = 24, bottom = floating ? 96 : 24;
  const usableW = width - left - right, usableH = height - top - bottom;
  // Never zoom out past the point where card text stops being readable on a projector (about 12px).
  const MIN_READABLE = web.mode === "nodes" ? 0.15 : floating ? 0.86 : 0.5;
  let scale = Math.min(1.1, usableW / (x1 - x0), usableH / (y1 - y0));
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (!only && scale < MIN_READABLE) {
    // Too big to show whole at a readable size: centre on the biggest cluster, so the first view is full of content.
    const hubs = [...web.nodes.values()].filter(isHub);
    const size = hub => [...web.nodes.values()].filter(node => node.home === hub.id).length;
    const biggest = hubs.sort((a, b) => size(b) - size(a))[0];
    if (biggest) { cx = biggest.x; cy = biggest.y; }
    scale = MIN_READABLE;
  }
  const transform = d3.zoomIdentity.translate(left + usableW / 2, top + usableH / 2).scale(scale).translate(-cx, -cy);
  const selection = d3.select(canvas);
  (animate ? selection.transition().duration(450) : selection).call(web.zoom.transform, transform);
}

function savePositions() {
  const project = currentProject();
  if (!web || web.projectId !== project.id) return;
  project.webLayout = Object.fromEntries([...web.nodes.values()].map(node => [node.id, [Math.round(node.x), Math.round(node.y), node.pinned ? 1 : 0]]));
  persist();
}

function applySearch() {
  const term = searchTerm.trim().toLowerCase();
  d3.select("#web-canvas").classed("searching", Boolean(term));
  const matches = d3.select("#web-cards").selectAll("div.web-card").classed("match", node => Boolean(term) && `${node.card.claim} ${node.card.short || ""}`.toLowerCase().includes(term));
  $("#web-search-count").textContent = term ? plural(matches.filter(".match").size(), "match") : "";
}

// ---------- Side panel and legend ----------

function renderSide() {
  const side = $("#web-side");
  if (document.activeElement?.id === "web-note") return; // don't rebuild the panel under someone typing a note
  const node = web?.selectedId && web.nodes.get(web.selectedId);
  side.classList.toggle("hidden", !node);
  if (!node) return;
  const project = currentProject();
  const card = node.card;
  const source = project.sources.find(item => item.id === card.sourceId);
  const citation = shortCitation(source?.meta);
  // Every relation, including ones the web doesn't draw.
  const drawn = new Set(web.links.map(link => link.edge.id));
  const relations = projectEdges(project).filter(edge => edge.a === card.id || edge.b === card.id)
    .sort((p, q) => drawn.has(q.id) - drawn.has(p.id) || q.confidence - p.confidence)
    .map(edge => {
      const { label, otherId } = describeRelation(edge, card.id);
      const other = web.nodes.get(otherId)?.card;
      return other ? `<li class="${drawn.has(edge.id) ? "" : "undrawn"}"><button type="button" data-web-goto="${escapeHtml(otherId)}"><span class="rel-dot" style="--rel:${relationTypes[edge.relation].colour}"></span><span><b>${escapeHtml(label)}</b> · ${escapeHtml(originOf(other.origin).label)}: ${escapeHtml(other.short || shortText(other.claim, 90))}</span></button><p>${escapeHtml(edge.rationale)} <small>${Math.round(edge.confidence * 100)}% sure${drawn.has(edge.id) ? "" : " · not drawn"}</small></p></li>` : "";
    }).join("");
  side.innerHTML = `
    <button class="drawer-close web-side-close" type="button" aria-label="Close" data-web-close>${icon("close")}</button>
    <div class="web-side-meta"><span class="origin-badge" style="--origin:${originOf(card.origin).colour}">${escapeHtml(originOf(card.origin).label)}</span>${citation ? `<span class="card-cite">${escapeHtml(citation)}</span>` : ""}</div>
    <h3>${escapeHtml(card.claim)}</h3>
    ${card.quotes.map(quote => `<blockquote>“${escapeHtml(quote.text)}”</blockquote><p class="web-side-location">${escapeHtml(quote.location)}</p>`).join("")}
    <p class="rail-label">Your note</p>
    <textarea class="web-note" id="web-note" placeholder="Add your own note on this idea…">${escapeHtml(card.note || "")}</textarea>
    <p class="rail-label">Relations</p>
    ${relations ? `<ul class="web-relations">${relations}</ul>` : `<p class="version-muted">No relations found yet.</p>`}
    <p class="web-side-hint">${node.pinned ? "Pinned where you dropped it. Double-click the card to unpin it." : "Drag the card to pin it in place."}</p>`;
  side.querySelector("[data-web-close]").addEventListener("click", () => select(null));
  side.querySelector("#web-note").addEventListener("input", event => { card.note = event.target.value; persist(); drawCards(); });
  side.querySelectorAll("[data-web-goto]").forEach(button => button.addEventListener("click", () => select(Number(button.dataset.webGoto), true)));
}

const lineSwatch = type => `<svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="${type.colour}" stroke-width="${type.double ? 4 : 2}" stroke-dasharray="${type.dash || ""}"/>${type.double ? `<line x1="1" y1="5" x2="25" y2="5" stroke="#fffefa" stroke-width="1.2"/>` : ""}</svg>`;

function renderLegend() {
  const nodes = [...web.nodes.values()];
  $("#web-legend").innerHTML = `
    <div class="legend-row">${Object.keys(origins).map(key => `<button type="button" class="legend-chip ${hidden.origins.has(key) ? "off" : ""}" data-toggle-origin="${key}"><span class="legend-shape" data-origin="${key}" style="--origin:${origins[key].colour}"></span>${escapeHtml(origins[key].label)} <small>${nodes.filter(node => node.card.origin === key).length}</small></button>`).join("")}</div>
    <div class="legend-row">${Object.entries(relationTypes).map(([key, type]) => `<button type="button" class="legend-chip ${hidden.relations.has(key) ? "off" : ""}" data-toggle-relation="${key}">${lineSwatch(type)}${escapeHtml(type.label)} <small>${web.links.filter(link => link.edge.relation === key).length}</small></button>`).join("")}</div>`;
  $("#web-legend").querySelectorAll("[data-toggle-origin]").forEach(button => button.addEventListener("click", () => toggle(hidden.origins, button.dataset.toggleOrigin)));
  $("#web-legend").querySelectorAll("[data-toggle-relation]").forEach(button => button.addEventListener("click", () => toggle(hidden.relations, button.dataset.toggleRelation)));
}

function toggle(set, key) {
  if (set.has(key)) set.delete(key); else set.add(key);
  drawCards(); drawLinks(); renderLegend();
}

// One-time wiring of the toolbar.
export function initWebControls() {
  // A trackpad pinch arrives as ctrl+wheel; over the web it must never zoom the whole page instead.
  $("#web-stage").addEventListener("wheel", event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  $("#web-search").addEventListener("input", event => { searchTerm = event.target.value; applySearch(); });
  $("#web-search").addEventListener("keydown", event => {
    if (event.key !== "Enter" || !web) return;
    const term = searchTerm.trim().toLowerCase();
    const match = [...web.nodes.values()].find(node => `${node.card.claim} ${node.card.short || ""}`.toLowerCase().includes(term));
    if (match) select(match.id, true);
  });
  $("#web-fit").addEventListener("click", () => fit());
  // Crossing between the floating (wide) and stacked (narrow) layouts changes the free space, so refit then.
  let wideLayout = innerWidth > 900;
  addEventListener("resize", () => { const wide = innerWidth > 900; if (wide !== wideLayout) { wideLayout = wide; fit(false); } });
  const setMode = mode => {
    viewMode = mode;
    try { localStorage.setItem("lattice-web-view", mode); } catch { /* storage blocked: the choice lasts this session */ }
    document.querySelectorAll("[data-web-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.webMode === mode)));
    if (!web) return;
    web.mode = mode;
    $("#web-canvas").classList.toggle("nodes-mode", mode === "nodes");
    // Both views share one layout, so switching only redraws: every idea stays exactly where it was.
    web.simulation.stop();
    drawCards();
    drawLinks();
  };
  document.querySelectorAll("[data-web-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.webMode)));
  document.querySelectorAll("[data-web-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.webMode === viewMode)));
  // Reset: every card and node goes back to its computed spot; pins and dragged positions are cleared.
  $("#web-reset").addEventListener("click", () => {
    if (!web) return;
    const project = currentProject();
    const nodes = [...web.nodes.values()];
    for (const node of nodes) { node.pinned = false; node.fx = null; node.fy = null; }
    project.webLayout = {};
    placeTargets(project); // also re-fixes each hub on its spot
    web.simulation.force("target-x").initialize(nodes);
    web.simulation.force("target-y").initialize(nodes);
    d3.select("#web-cards").selectAll("div.web-card").classed("pinned", false);
    web.fitted = false;
    web.simulation.alpha(1).restart();
    persist();
  });
  const zoomBy = factor => { if (web) d3.select("#web-canvas").transition().duration(200).call(web.zoom.scaleBy, factor); };
  $("#web-zoom-in").addEventListener("click", () => zoomBy(1.25));
  $("#web-zoom-out").addEventListener("click", () => zoomBy(0.8));
  $("#web-attention-toggle").addEventListener("click", () => setAttentionOpen($("#web-attention").classList.contains("hidden")));
  $("#web-add-sticky").addEventListener("click", () => {
    const canvas = $("#web-canvas");
    const [x, y] = d3.zoomTransform(canvas).invert([canvas.clientWidth / 2, canvas.clientHeight / 2]);
    addSticky(x - STICKY_W / 2, y - STICKY_H / 2);
  });
  $("#web-show-all").addEventListener("change", event => { showAll = event.target.checked; renderWeb(); });
}

// ---------- Sticky notes ----------
// Free notes on the canvas: { id, x, y, text, colour }, stored on the project. They pan and zoom with the web
// but take no part in the physics.

// Mirrors --sticky-* in tokens.css (test/tokens.test.js keeps them in step).
// A note's default footprint on the canvas; mirrors .web-sticky's width and its textarea's min-height in styles.css.
const STICKY_W = 260;
const STICKY_H = 166;
const stickyColours = { yellow: "#ffef9f", pink: "#ffc9e0", green: "#c5f2d4", blue: "#c7e4ff" };

function addSticky(x, y) {
  const project = currentProject();
  const sticky = { id: crypto.randomUUID(), x: Math.round(x), y: Math.round(y), text: "", colour: "yellow", createdAt: new Date().toISOString() };
  project.stickies = [...(project.stickies || []), sticky];
  persist();
  renderStickies();
  document.querySelector(`.web-sticky[data-id="${sticky.id}"] textarea`)?.focus();
}

function renderStickies() {
  const stickies = currentProject().stickies || [];
  d3.select("#web-stickies").selectAll("div.web-sticky").data(stickies, sticky => sticky.id)
    .join(enter => enter.append("div").attr("class", "web-sticky").each(function () { bindSticky(this); }))
    .attr("data-id", sticky => sticky.id)
    .style("--sticky", sticky => stickyColours[sticky.colour] || stickyColours.yellow)
    .style("transform", sticky => `translate(${sticky.x}px, ${sticky.y}px)`)
    .each(function (sticky) {
      const area = this.querySelector("textarea");
      if (document.activeElement !== area) area.value = sticky.text;
    });
}

function bindSticky(element) {
  element.innerHTML = `<div class="sticky-bar">${Object.entries(stickyColours).map(([key, colour]) => `<button class="sticky-colour" type="button" data-colour="${key}" style="--swatch:${colour}" aria-label="${key}"></button>`).join("")}<button class="sticky-delete" type="button" aria-label="Delete sticky note" title="Delete">${icon("close")}</button></div><textarea aria-label="Sticky note" placeholder="Write a note…"></textarea>`;
  const datum = () => d3.select(element).datum();
  element.querySelector("textarea").addEventListener("input", event => { datum().text = event.target.value; persist(); });
  element.querySelectorAll("[data-colour]").forEach(button => button.addEventListener("click", () => { datum().colour = button.dataset.colour; persist(); renderStickies(); }));
  element.querySelector(".sticky-delete").addEventListener("click", async () => {
    const sticky = datum();
    if (sticky.text.trim() && !await confirmDialog({ title: "Delete sticky note?", message: "Are you sure you want to delete this note?" })) return;
    const project = currentProject();
    const index = project.stickies.findIndex(item => item.id === sticky.id);
    project.stickies = project.stickies.filter(item => item.id !== sticky.id);
    persist(); renderStickies();
    if (sticky.text.trim()) toast("Sticky note deleted.", { label: "Undo", run: () => {
      project.stickies = [...project.stickies.slice(0, index), sticky, ...project.stickies.slice(index)];
      persist();
      if (currentProject() === project) renderStickies();
    } });
  });
  element.addEventListener("dblclick", event => event.stopPropagation());
  const canvas = $("#web-canvas");
  let offset = null;
  d3.select(element).call(d3.drag().container(() => canvas).subject(event => ({ x: event.x, y: event.y })) // raw pointer; converted to web coordinates below
   
    .filter(event => !event.target.closest("textarea, button") && !event.button)
    .on("start", event => {
      const [x, y] = d3.zoomTransform(canvas).invert([event.x, event.y]);
      offset = [datum().x - x, datum().y - y];
    })
    .on("drag", event => {
      const [x, y] = d3.zoomTransform(canvas).invert([event.x, event.y]);
      Object.assign(datum(), { x: Math.round(x + offset[0]), y: Math.round(y + offset[1]) });
      element.style.transform = `translate(${datum().x}px, ${datum().y}px)`;
    })
    .on("end", () => persist()));
}

// When the Web tab becomes visible: measure the cards, and fit if that couldn't happen while hidden.
export function webShown() {
  if (!web) { renderWeb(); return; }
  drawCards();
  if (!web.fitted && web.simulation.alpha() < web.simulation.alphaMin()) { web.fitted = true; fit(false); }
  web.simulation.alpha(Math.max(web.simulation.alpha(), 0.1)).restart();
}

// Restore, delete, or a different project: start the web again from stored positions.
export function resetWeb() {
  web?.simulation.stop();
  web = null;
}
