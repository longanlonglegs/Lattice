// The idea web: the project's ideas as cards on a pannable canvas. Hypothesis guesses are large hub cards on a
// ring in the middle; each piece of evidence gathers around the guess it bears on most. Uses d3 (a global).
import { $, escapeHtml, plural } from "../util.js";
import { currentProject, persist } from "../state.js";
import { origins, originOf } from "../origins.js";
import { graphLoaded, projectEdges, webCards } from "../pipeline.js";
import { relationTypes, describeRelation, edgeEnds, shortText, visibleEdges } from "../relations.js";
import { shortCitation } from "../records.js";
import { renderAttention, setAttentionOpen } from "./attention.js";

const d3 = window.d3;
const SIZE = { hub: [300, 150], card: [210, 92] }; // fallback sizes until a card has been measured
const hidden = { origins: new Set(), relations: new Set() };
let web = null; // { projectId, simulation, nodes: Map, links: [], zoom, selectedId, signature, fitted }
let searchTerm = "";
let showAll = false;

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
    .filter(event => !event.target.closest?.(".web-card, .web-side, .web-sticky, .web-attention") && (!event.ctrlKey || event.type === "wheel") && !event.button)
    .on("zoom", event => {
      const { x, y, k } = event.transform;
      $("#web-world").style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    });
  canvas.call(zoom).on("dblclick.zoom", null);
  canvas.on("click", event => { if (!event.target.closest(".web-card, .web-side, .web-sticky, .web-attention")) select(null); });
  canvas.on("dblclick", event => {
    if (event.target.closest(".web-card, .web-side, .web-sticky, .web-attention")) return;
    const [x, y] = d3.zoomTransform(canvas.node()).invert(d3.pointer(event, canvas.node()));
    addSticky(x - 95, y - 20);
  });

  const simulation = d3.forceSimulation()
    .force("target-x", d3.forceX(node => node.target?.x ?? 0).strength(node => node.target ? 0.07 : 0.02))
    .force("target-y", d3.forceY(node => node.target?.y ?? 0).strength(node => node.target ? 0.07 : 0.02))
    .force("link", d3.forceLink().id(node => node.id).distance(240).strength(0.02))
    .force("charge", d3.forceManyBody().strength(-160).distanceMax(500))
    .force("collide", rectCollide(18))
    .alphaDecay(0.035)
    .on("tick", tick)
    .on("end", () => { savePositions(); if (!web.fitted) { web.fitted = true; fit(false); } });
  web = { projectId: project.id, simulation, nodes: new Map(), links: [], zoom, selectedId: null, signature: "", fitted: false };
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

// Hubs sit evenly on a ring. Each piece of evidence aims for a spot just outside its strongest hypothesis guess;
// evidence with no link to the hypothesis aims for an outer band, one direction per source.
function placeTargets(project) {
  const nodes = [...web.nodes.values()];
  const hubs = nodes.filter(isHub).sort((a, b) => a.id - b.id);
  const ring = hubs.length > 1 ? Math.max(240, hubs.length * 115) : 0;
  hubs.forEach((hub, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / hubs.length;
    hub.angle = angle;
    hub.target = { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
    if (!hub.pinned) { hub.fx = hub.target.x; hub.fy = hub.target.y; }
  });
  const strongestHub = new Map();
  for (const link of web.links) {
    const [hub, other] = isHub(link.source) ? [link.source, link.target] : isHub(link.target) ? [link.target, link.source] : [null, null];
    if (!hub || isHub(other)) continue;
    const best = strongestHub.get(other.id);
    if (!best || link.edge.confidence > best.confidence) strongestHub.set(other.id, { hub, confidence: link.edge.confidence });
  }
  // Each hub's evidence fans out on an arc facing away from the centre (two staggered rows), so the cards
  // around one hub don't compete for the same spot. With a single hub, the arc goes all the way round.
  const members = new Map(hubs.map(hub => [hub.id, []]));
  const loose = [];
  const sources = project.sources.map(source => source.id);
  const bySource = (a, b) => sources.indexOf(a.card.sourceId) - sources.indexOf(b.card.sourceId) || a.id - b.id;
  for (const node of nodes) {
    if (isHub(node)) continue;
    const home = strongestHub.get(node.id)?.hub;
    node.home = home?.id ?? null;
    if (home) members.get(home.id).push(node); else loose.push(node);
  }
  for (const hub of hubs) {
    const group = members.get(hub.id).sort(bySource);
    const arc = hubs.length > 1 ? Math.min(Math.PI * 0.9, group.length * 0.42) : Math.PI * 2 * (1 - 1 / Math.max(2, group.length));
    group.forEach((node, index) => {
      const angle = hub.angle + (group.length > 1 ? (index / (group.length - 1) - 0.5) * arc : 0);
      const radius = 260 + (index % 2) * 140;
      node.target = { x: hub.target.x + Math.cos(angle) * radius * 1.15, y: hub.target.y + Math.sin(angle) * radius * 0.85 };
    });
  }
  // Evidence with no hypothesis link: an outer band, grouped by source.
  const outer = ring + 560;
  loose.sort(bySource).forEach((node, index) => {
    const angle = Math.PI / 4 + (2 * Math.PI * index) / Math.max(1, loose.length);
    node.target = { x: Math.cos(angle) * outer * 1.2, y: Math.sin(angle) * outer * 0.85 };
  });
}

// ---------- Rendering ----------

export function renderWeb() {
  if (!d3) return;
  const project = currentProject();
  const cards = webCards(project);
  $("#web-empty").classList.toggle("hidden", cards.length > 0);
  $("#web-stage").classList.toggle("hidden", !cards.length);
  if (!cards.length) { web?.simulation.stop(); return; }
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
  if (web.selectedId && !web.nodes.has(web.selectedId)) select(null); else renderSide();
}

const noteIcon = card => card.note?.trim() ? `<span class="wc-note" title="${escapeHtml(card.note)}">✎</span>` : "";

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
      <p class="wc-tally"><span class="for">▲ ${tally.for} for</span><span class="against">▼ ${tally.against} against</span></p>`;
  }
  const source = currentProject().sources.find(item => item.id === card.sourceId);
  const citation = shortCitation(source?.meta) || shortText(source?.meta?.title || source?.title || "", 28);
  return `<p class="wc-kicker"><span class="wc-dot"></span>${escapeHtml(originOf(card.origin).short)}${citation ? ` · ${escapeHtml(citation)}` : ""}${card.state === "approved" ? ` <b title="Saved">✓</b>` : ""}${noteIcon(card)}</p>
    <p class="wc-text">${escapeHtml(card.short || shortText(card.claim, 95))}</p>`;
}

function drawCards() {
  const nodes = [...web.nodes.values()];
  d3.select("#web-cards").selectAll("div.web-card").data(nodes, node => node.id)
    .join(enter => enter.append("div").attr("class", "web-card").each(function (node) { bindCard(this, node); }))
    .attr("data-origin", node => node.card.origin)
    .classed("hub", isHub)
    .classed("saved", node => node.card.state === "approved")
    .classed("pinned", node => node.pinned)
    .classed("filtered", node => hidden.origins.has(node.card.origin))
    .style("--origin", node => originOf(node.card.origin).colour)
    .attr("title", node => node.card.claim)
    .each(function (node) {
      const html = cardHtml(node);
      if (this.dataset.html !== html) { this.innerHTML = html; this.dataset.html = html; }
      // Measure once the card is visible (the Web tab may be hidden); until then the default size is used.
      if (this.offsetWidth) { node.w = this.offsetWidth; node.h = this.offsetHeight; }
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
  element.addEventListener("mouseenter", () => highlight(node.id));
  element.addEventListener("mouseleave", () => highlight(web.selectedId));
}

function drawLinks() {
  const groups = d3.select("#web-svg .web-links").selectAll("g.web-link").data(web.links, link => link.edge.id)
    .join(enter => {
      const group = enter.append("g").attr("class", "web-link");
      group.append("line").attr("class", "link-main");
      group.append("line").attr("class", "link-inner");
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
    .attr("stroke-width", link => (relationTypes[link.edge.relation].double ? 3 : 1) + link.edge.confidence * 2.5)
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
    d3.select(this).selectAll("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
  });
  d3.select("#web-cards").selectAll("div.web-card").style("transform", node => `translate(${node.x - node.w / 2}px, ${node.y - node.h / 2}px)`);
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
  const boxes = only || [...web.nodes.values(), ...(currentProject().stickies || []).map(sticky => ({ x: sticky.x + 95, y: sticky.y + 50, w: 190, h: 100 }))];
  const x0 = d3.min(boxes, box => box.x - box.w / 2), x1 = d3.max(boxes, box => box.x + box.w / 2);
  const y0 = d3.min(boxes, box => box.y - box.h / 2), y1 = d3.max(boxes, box => box.y + box.h / 2);
  // Leave room for the side panel when zooming to a pair.
  const usable = only ? width - 380 : width;
  const scale = Math.min(1.1, (usable - 60) / (x1 - x0), (height - 60) / (y1 - y0));
  const transform = d3.zoomIdentity.translate(usable / 2, height / 2).scale(scale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
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
    <button class="drawer-close web-side-close" type="button" aria-label="Close" data-web-close>×</button>
    <div class="web-side-meta"><span class="origin-badge" style="--origin:${originOf(card.origin).colour}">${escapeHtml(originOf(card.origin).label)}</span>${citation ? `<span class="card-cite">${escapeHtml(citation)}</span>` : ""}${card.state === "approved" ? `<span class="card-cite">✓ Saved</span>` : ""}</div>
    <h3>${escapeHtml(card.claim)}</h3>
    ${card.quotes.map(quote => `<blockquote>“${escapeHtml(quote.text)}”</blockquote><p class="web-side-location">${escapeHtml(quote.location)}</p>`).join("")}
    <p class="rail-label">YOUR NOTE</p>
    <textarea class="web-note" id="web-note" placeholder="Add your own note on this idea…">${escapeHtml(card.note || "")}</textarea>
    <p class="rail-label">RELATIONS</p>
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
    <div class="legend-row">${Object.keys(origins).map(key => `<button type="button" class="legend-chip ${hidden.origins.has(key) ? "off" : ""}" data-toggle-origin="${key}"><span class="legend-dot" style="--origin:${origins[key].colour}"></span>${escapeHtml(origins[key].label)} <small>${nodes.filter(node => node.card.origin === key).length}</small></button>`).join("")}</div>
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
  $("#web-search").addEventListener("input", event => { searchTerm = event.target.value; applySearch(); });
  $("#web-search").addEventListener("keydown", event => {
    if (event.key !== "Enter" || !web) return;
    const term = searchTerm.trim().toLowerCase();
    const match = [...web.nodes.values()].find(node => `${node.card.claim} ${node.card.short || ""}`.toLowerCase().includes(term));
    if (match) select(match.id, true);
  });
  $("#web-fit").addEventListener("click", () => fit());
  $("#web-attention-toggle").addEventListener("click", () => setAttentionOpen($("#web-attention").classList.contains("hidden")));
  $("#web-add-sticky").addEventListener("click", () => {
    const canvas = $("#web-canvas");
    const [x, y] = d3.zoomTransform(canvas).invert([canvas.clientWidth / 2, canvas.clientHeight / 2]);
    addSticky(x - 95, y - 50);
  });
  $("#web-show-all").addEventListener("change", event => { showAll = event.target.checked; renderWeb(); });
}

// ---------- Sticky notes ----------
// Free notes on the canvas: { id, x, y, text, colour }, stored on the project. They pan and zoom with the web
// but take no part in the physics.

const stickyColours = { yellow: "#fbe9a6", pink: "#f6cfd6", green: "#d5ebd0", blue: "#d2e2f4" };

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
  element.innerHTML = `<div class="sticky-bar">${Object.entries(stickyColours).map(([key, colour]) => `<button class="sticky-colour" type="button" data-colour="${key}" style="--swatch:${colour}" aria-label="${key}"></button>`).join("")}<button class="sticky-delete" type="button" aria-label="Delete sticky note" title="Delete">×</button></div><textarea aria-label="Sticky note" placeholder="Write a note…"></textarea>`;
  const datum = () => d3.select(element).datum();
  element.querySelector("textarea").addEventListener("input", event => { datum().text = event.target.value; persist(); });
  element.querySelectorAll("[data-colour]").forEach(button => button.addEventListener("click", () => { datum().colour = button.dataset.colour; persist(); renderStickies(); }));
  element.querySelector(".sticky-delete").addEventListener("click", () => {
    const sticky = datum();
    if (sticky.text.trim() && !window.confirm("Delete this sticky note?")) return;
    const project = currentProject();
    project.stickies = project.stickies.filter(item => item.id !== sticky.id);
    persist(); renderStickies();
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
