// The idea web: a physics-driven network of the project's ideas. Uses d3 (a global, loaded from node_modules).
import { $, escapeHtml, plural } from "../util.js";
import { currentProject, persist } from "../state.js";
import { origins, originOf } from "../origins.js";
import { projectEdges, webCards } from "../pipeline.js";
import { relationTypes, describeRelation, edgeEnds, shortText } from "../relations.js";
import { shortCitation } from "../records.js";

const d3 = window.d3;
const radius = origin => origin === "hypothesis" ? 14 : 9;
const hidden = { origins: new Set(), relations: new Set() };
let web = null; // { projectId, simulation, nodes: Map, links: [], zoom, selectedId, fitted }
let searchTerm = "";

function shapePath(origin) {
  const r = radius(origin);
  switch (originOf(origin).shape) {
    case "square": return `M${-r},${-r}h${2 * r}v${2 * r}h${-2 * r}Z`;
    case "rounded": { const w = r * 1.35, h = r, c = 4; return `M${-w + c},${-h}H${w - c}Q${w},${-h} ${w},${-h + c}V${h - c}Q${w},${h} ${w - c},${h}H${-w + c}Q${-w},${h} ${-w},${h - c}V${-h + c}Q${-w},${-h} ${-w + c},${-h}Z`; }
    case "diamond": return `M0,${-r * 1.3}L${r * 1.3},0L0,${r * 1.3}L${-r * 1.3},0Z`;
    default: return `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0Z`;
  }
}

// ---------- Setup ----------

function createWeb(project) {
  web?.simulation.stop();
  const svg = d3.select("#web-svg");
  svg.selectAll("*").remove();
  const defs = svg.append("defs");
  for (const [key, type] of Object.entries(relationTypes)) {
    if (!type.arrow) continue;
    defs.append("marker").attr("id", `arrow-${key}`).attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L10,0L0,4").attr("fill", type.colour);
  }
  const layer = svg.append("g").attr("class", "web-layer");
  layer.append("g").attr("class", "web-links");
  layer.append("g").attr("class", "web-nodes");
  const zoom = d3.zoom().scaleExtent([0.15, 4]).on("zoom", event => {
    layer.attr("transform", event.transform);
    svg.classed("zoomed-in", event.transform.k >= 1.3);
    // Keep labels the same size on screen at any zoom.
    svg.style("--label-size", `${11 / Math.max(event.transform.k, 0.4)}px`);
  });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", event => { if (event.target === svg.node()) select(null); });

  const simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(node => node.id).distance(link => relationTypes[link.edge.relation].distance).strength(link => relationTypes[link.edge.relation].strength * (0.5 + link.edge.confidence / 2)))
    .force("charge", d3.forceManyBody().strength(node => node.card.origin === "hypothesis" ? -700 : -280).distanceMax(700))
    .force("collide", d3.forceCollide(node => radius(node.card.origin) + 12))
    .force("x", d3.forceX(0).strength(node => node.card.origin === "hypothesis" ? 0.1 : 0.03))
    .force("y", d3.forceY(0).strength(node => node.card.origin === "hypothesis" ? 0.1 : 0.03))
    .on("tick", tick)
    .on("end", () => { savePositions(); if (!web.fitted) { web.fitted = true; fit(false); } });
  web = { projectId: project.id, simulation, nodes: new Map(), links: [], zoom, selectedId: null, fitted: false, signature: "" };
}

// ---------- Data ----------

function startPosition(card, project, links) {
  const saved = project.webLayout?.[card.id];
  if (saved) return { x: saved[0], y: saved[1], pinned: Boolean(saved[2]) };
  // New ideas start next to the ideas they are linked to, or next to ideas from the same source.
  const neighbours = links.filter(link => link.from === card.id || link.to === card.id).map(link => web.nodes.get(link.from === card.id ? link.to : link.from)).filter(Boolean);
  const siblings = neighbours.length ? neighbours : [...web.nodes.values()].filter(node => node.card.sourceId && node.card.sourceId === card.sourceId);
  const jitter = () => (Math.random() - 0.5) * 60;
  if (siblings.length) return { x: d3.mean(siblings, node => node.x) + jitter(), y: d3.mean(siblings, node => node.y) + jitter() };
  const angle = Math.random() * Math.PI * 2;
  return { x: Math.cos(angle) * 220, y: Math.sin(angle) * 160 };
}

export function renderWeb() {
  if (!d3) return;
  const project = currentProject();
  const cards = webCards(project);
  $("#web-empty").classList.toggle("hidden", cards.length > 0);
  $("#web-stage").classList.toggle("hidden", !cards.length);
  if (!cards.length) { web?.simulation.stop(); return; }
  if (!web || web.projectId !== project.id) createWeb(project);

  const edges = projectEdges(project).map(edge => ({ edge, ...edgeEnds(edge) }));
  const ids = new Set(cards.map(item => item.id));
  let changed = false;
  for (const id of [...web.nodes.keys()]) if (!ids.has(id)) { web.nodes.delete(id); changed = true; }
  for (const card of cards) {
    const node = web.nodes.get(card.id);
    if (node) { node.card = card; continue; }
    const start = startPosition(card, project, edges);
    web.nodes.set(card.id, { id: card.id, card, x: start.x, y: start.y, pinned: Boolean(start.pinned), fx: start.pinned ? start.x : null, fy: start.pinned ? start.y : null });
    changed = true;
  }
  const signature = edges.map(link => `${link.edge.id}:${link.edge.relation}`).sort().join(",");
  if (signature !== web.signature) { web.signature = signature; changed = true; }

  if (changed) {
    web.links = edges.map(link => ({ ...link, source: link.from, target: link.to }));
    const nodes = [...web.nodes.values()];
    web.simulation.nodes(nodes);
    web.simulation.force("link").links(web.links);
    const allSaved = nodes.every(node => project.webLayout?.[node.id]);
    web.simulation.alpha(allSaved && !web.started ? 0.05 : 0.5).restart();
    web.started = true;
  } else {
    // Same edges: refresh rationale and confidence without restarting the physics.
    const byId = new Map(edges.map(link => [link.edge.id, link.edge]));
    web.links.forEach(link => { link.edge = byId.get(link.edge.id) || link.edge; });
  }
  draw();
  renderLegend();
  if (web.selectedId && !web.nodes.has(web.selectedId)) select(null); else renderSide();
}

// ---------- Drawing ----------

function draw() {
  const svg = d3.select("#web-svg");
  const linkGroups = svg.select(".web-links").selectAll("g.web-link").data(web.links, link => link.edge.id)
    .join(enter => {
      const group = enter.append("g").attr("class", "web-link");
      group.append("line").attr("class", "link-main");
      group.append("line").attr("class", "link-inner");
      return group;
    });
  linkGroups.attr("data-relation", link => link.edge.relation)
    .classed("filtered", link => hidden.relations.has(link.edge.relation) || hidden.origins.has(web.nodes.get(link.from)?.card.origin) || hidden.origins.has(web.nodes.get(link.to)?.card.origin));
  linkGroups.select(".link-main")
    .attr("stroke", link => relationTypes[link.edge.relation].colour)
    .attr("stroke-width", link => (relationTypes[link.edge.relation].double ? 3 : 1) + link.edge.confidence * 2.5)
    .attr("stroke-dasharray", link => relationTypes[link.edge.relation].dash || null)
    .attr("marker-end", link => relationTypes[link.edge.relation].arrow ? `url(#arrow-${link.edge.relation})` : null);
  linkGroups.select(".link-inner").attr("display", link => relationTypes[link.edge.relation].double ? null : "none").attr("stroke-width", 1.4);
  linkGroups.select("title").remove();
  linkGroups.append("title").text(link => `${relationTypes[link.edge.relation].label}: ${link.edge.rationale}`);

  const nodeGroups = svg.select(".web-nodes").selectAll("g.web-node").data([...web.nodes.values()], node => node.id)
    .join(enter => {
      const group = enter.append("g").attr("class", "web-node");
      group.append("path").attr("class", "node-shape");
      group.append("text").attr("class", "node-label");
      group.append("title");
      group.call(d3.drag()
        .on("start", (event, node) => { if (!event.active) web.simulation.alphaTarget(0.2).restart(); node.fx = node.x; node.fy = node.y; })
        .on("drag", (event, node) => { node.fx = event.x; node.fy = event.y; })
        .on("end", (event, node) => { if (!event.active) web.simulation.alphaTarget(0); node.pinned = true; savePositions(); renderSide(); }));
      group.on("click", (event, node) => { event.stopPropagation(); select(node.id); })
        .on("dblclick", (event, node) => { event.stopPropagation(); node.fx = null; node.fy = null; node.pinned = false; web.simulation.alpha(0.3).restart(); savePositions(); renderSide(); })
        .on("mouseenter", (event, node) => highlight(node.id))
        .on("mouseleave", () => highlight(web.selectedId));
      return group;
    });
  nodeGroups.attr("data-origin", node => node.card.origin)
    .classed("saved", node => node.card.state === "approved")
    .classed("pinned", node => node.pinned)
    .classed("filtered", node => hidden.origins.has(node.card.origin));
  nodeGroups.select(".node-shape").attr("d", node => shapePath(node.card.origin)).attr("fill", node => originOf(node.card.origin).colour);
  nodeGroups.select(".node-label").attr("y", node => radius(node.card.origin) + 13).text(node => shortText(node.card.claim, 40));
  nodeGroups.select("title").text(node => node.card.claim);
  applySearch();
  highlight(web.selectedId);
  tick();
}

// Lines stop at the edge of each node so arrowheads stay visible.
function tick() {
  if (!web) return;
  const svg = d3.select("#web-svg");
  svg.selectAll("g.web-link").each(function (link) {
    const source = link.source, target = link.target;
    if (!source || typeof source !== "object") return;
    const dx = target.x - source.x, dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const start = radius(source.card.origin) + 2, end = radius(target.card.origin) + (relationTypes[link.edge.relation].arrow ? 5 : 2);
    const x1 = source.x + dx / length * start, y1 = source.y + dy / length * start;
    const x2 = target.x - dx / length * end, y2 = target.y - dy / length * end;
    d3.select(this).selectAll("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
  });
  svg.selectAll("g.web-node").attr("transform", node => `translate(${node.x},${node.y})`);
}

// ---------- Interaction ----------

function neighbours(id) {
  const ids = new Set([id]);
  web.links.forEach(link => { if (link.from === id) ids.add(link.to); if (link.to === id) ids.add(link.from); });
  return ids;
}

function highlight(id) {
  const svg = d3.select("#web-svg");
  const near = id ? neighbours(id) : null;
  svg.classed("focused", Boolean(id));
  svg.selectAll("g.web-node").classed("near", node => Boolean(near?.has(node.id))).classed("selected", node => node.id === web.selectedId);
  svg.selectAll("g.web-link").classed("near", link => Boolean(id) && (link.from === id || link.to === id));
}

export function select(id, center = false) {
  if (!web) return;
  web.selectedId = id;
  highlight(id);
  renderSide();
  const node = id && web.nodes.get(id);
  if (node && center) d3.select("#web-svg").transition().duration(450).call(web.zoom.translateTo, node.x, node.y);
}

function fit(animate = true) {
  if (!web?.nodes.size) return;
  const nodes = [...web.nodes.values()];
  const [x0, x1] = d3.extent(nodes, node => node.x), [y0, y1] = d3.extent(nodes, node => node.y);
  const scale = Math.min(4, 0.9 / Math.max((x1 - x0 + 80) / 1200, (y1 - y0 + 80) / 760));
  const transform = d3.zoomIdentity.scale(scale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  const svg = d3.select("#web-svg");
  (animate ? svg.transition().duration(450) : svg).call(web.zoom.transform, transform);
}

function savePositions() {
  const project = currentProject();
  if (!web || web.projectId !== project.id) return;
  project.webLayout = Object.fromEntries([...web.nodes.values()].map(node => [node.id, [Math.round(node.x), Math.round(node.y), node.pinned ? 1 : 0]]));
  persist();
}

function applySearch() {
  const term = searchTerm.trim().toLowerCase();
  const svg = d3.select("#web-svg");
  svg.classed("searching", Boolean(term));
  svg.selectAll("g.web-node").classed("match", node => Boolean(term) && node.card.claim.toLowerCase().includes(term));
  $("#web-search-count").textContent = term ? plural(svg.selectAll("g.web-node.match").size(), "match") : "";
}

// ---------- Side panel and legend ----------

function renderSide() {
  const side = $("#web-side");
  const node = web?.selectedId && web.nodes.get(web.selectedId);
  side.classList.toggle("hidden", !node);
  if (!node) return;
  const project = currentProject();
  const card = node.card;
  const source = project.sources.find(item => item.id === card.sourceId);
  const citation = shortCitation(source?.meta);
  const relations = web.links.filter(link => link.from === card.id || link.to === card.id)
    .sort((p, q) => q.edge.confidence - p.edge.confidence)
    .map(link => {
      const { label, otherId } = describeRelation(link.edge, card.id);
      const other = web.nodes.get(otherId)?.card;
      return other ? `<li><button type="button" data-web-goto="${escapeHtml(otherId)}"><span class="rel-dot" style="--rel:${relationTypes[link.edge.relation].colour}"></span><b>${escapeHtml(label)}</b> · ${escapeHtml(originOf(other.origin).label)}: ${escapeHtml(shortText(other.claim, 90))}</button><p>${escapeHtml(link.edge.rationale)} <small>${Math.round(link.edge.confidence * 100)}% sure</small></p></li>` : "";
    }).join("");
  side.innerHTML = `
    <button class="drawer-close web-side-close" type="button" aria-label="Close" data-web-close>×</button>
    <div class="web-side-meta"><span class="origin-badge" style="--origin:${originOf(card.origin).colour}">${escapeHtml(originOf(card.origin).label)}</span>${citation ? `<span class="card-cite">${escapeHtml(citation)}</span>` : ""}${card.state === "approved" ? `<span class="card-cite">✓ Saved</span>` : ""}</div>
    <h3>${escapeHtml(card.claim)}</h3>
    <blockquote>“${escapeHtml(card.quote)}”</blockquote>
    <p class="web-side-location">${escapeHtml(card.location)}${source ? ` · ${escapeHtml(source.meta?.title || source.title)}` : ""}</p>
    <p class="rail-label">RELATIONS</p>
    ${relations ? `<ul class="web-relations">${relations}</ul>` : `<p class="version-muted">No relations found yet.</p>`}
    <p class="web-side-hint">${node.pinned ? "Pinned where you dropped it. Double-click the idea to unpin it." : "Drag the idea to pin it in place."}</p>`;
  side.querySelector("[data-web-close]").addEventListener("click", () => select(null));
  side.querySelectorAll("[data-web-goto]").forEach(button => button.addEventListener("click", () => select(Number(button.dataset.webGoto), true)));
}

const swatch = key => `<svg viewBox="-16 -16 32 32" aria-hidden="true"><path d="${shapePath(key)}" fill="${origins[key].colour}"/></svg>`;
const lineSwatch = type => `<svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="${type.colour}" stroke-width="${type.double ? 4 : 2}" stroke-dasharray="${type.dash || ""}"/>${type.double ? `<line x1="1" y1="5" x2="25" y2="5" stroke="#fffefa" stroke-width="1.2"/>` : ""}</svg>`;

function renderLegend() {
  const nodes = [...web.nodes.values()];
  $("#web-legend").innerHTML = `
    <div class="legend-row">${Object.keys(origins).map(key => `<button type="button" class="legend-chip ${hidden.origins.has(key) ? "off" : ""}" data-toggle-origin="${key}">${swatch(key)}${escapeHtml(origins[key].label)} <small>${nodes.filter(node => node.card.origin === key).length}</small></button>`).join("")}</div>
    <div class="legend-row">${Object.entries(relationTypes).map(([key, type]) => `<button type="button" class="legend-chip ${hidden.relations.has(key) ? "off" : ""}" data-toggle-relation="${key}">${lineSwatch(type)}${escapeHtml(type.label)} <small>${web.links.filter(link => link.edge.relation === key).length}</small></button>`).join("")}</div>`;
  $("#web-legend").querySelectorAll("[data-toggle-origin]").forEach(button => button.addEventListener("click", () => toggle(hidden.origins, button.dataset.toggleOrigin)));
  $("#web-legend").querySelectorAll("[data-toggle-relation]").forEach(button => button.addEventListener("click", () => toggle(hidden.relations, button.dataset.toggleRelation)));
}

function toggle(set, key) {
  if (set.has(key)) set.delete(key); else set.add(key);
  draw(); renderLegend();
}

// One-time wiring of the toolbar.
export function initWebControls() {
  $("#web-search").addEventListener("input", event => { searchTerm = event.target.value; applySearch(); });
  $("#web-search").addEventListener("keydown", event => {
    if (event.key !== "Enter" || !web) return;
    const match = [...web.nodes.values()].find(node => node.card.claim.toLowerCase().includes(searchTerm.trim().toLowerCase()));
    if (match) select(match.id, true);
  });
  $("#web-fit").addEventListener("click", () => fit());
}

// Restore, delete, or a different project: start the web again from stored positions.
export function resetWeb() {
  web?.simulation.stop();
  web = null;
}
