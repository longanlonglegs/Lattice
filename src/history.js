// Question & history tab: recorded versions of the question and hypothesis, and the hypothesis guesses.
import { $, escapeHtml, toast, relativeTime } from "./util.js";
import { card, currentProject, nextCardId, persist, recordActivity, saveWorkspace } from "./state.js";
import { renderProject } from "./workspace.js";
import { cardLocation, sentenceGuesses, wordDiff } from "./records.js";

export const latestVersion = project => project.versions.at(-1) || null;
export const isHypothesis = item => item.origin === "hypothesis";
export const currentGuesses = project => project.cards.filter(item => isHypothesis(item) && !item.superseded);

// True when the question or hypothesis differs from the last recorded version.
export function hasUnrecordedChanges(project) {
  const latest = latestVersion(project);
  return !latest || latest.question !== project.question || latest.hypothesis !== project.hypothesis;
}

function save(project) {
  if (project === currentProject()) { saveWorkspace(); renderProject(); } else persist();
}

async function splitGuesses(project, hypothesis) {
  try {
    const response = await fetch("/api/split-hypothesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: project.question, hypothesis }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.guesses?.length) throw new Error(payload.error || "AI splitting is unavailable");
    return { method: "ai", guesses: payload.guesses };
  } catch {
    return { method: "basic", guesses: sentenceGuesses(hypothesis) };
  }
}

// Saves the current question and hypothesis as a new version. If the hypothesis changed, the old
// guesses are marked superseded and the new hypothesis is split into guesses (one card each).
export async function recordVersion(project, { note = "", linkedCardIds = [] } = {}) {
  const previous = latestVersion(project);
  const now = new Date().toISOString();
  const version = { id: crypto.randomUUID(), number: project.versions.length + 1, question: project.question, hypothesis: project.hypothesis, note, linkedCardIds, createdAt: now };
  project.versions.push(version);
  recordActivity("setup", `Recorded version ${version.number} of the question and hypothesis`, note, project);
  const hypothesisChanged = !previous || previous.hypothesis !== version.hypothesis;
  if (hypothesisChanged) project.cards.forEach(item => { if (isHypothesis(item)) item.superseded = true; });
  project.updatedAt = now;
  save(project);
  if (!hypothesisChanged || !version.hypothesis) return { version, guesses: 0 };
  const result = await splitGuesses(project, version.hypothesis);
  project.cards.push(...result.guesses.map(item => ({ ...card(nextCardId(), item.guess, [{ text: item.quote, location: `Hypothesis v${version.number}` }], "", "hypothesis"), versionId: version.id })));
  save(project);
  return { version, guesses: result.guesses.length, method: result.method };
}

export async function recordFromForm() {
  const project = currentProject();
  saveWorkspace();
  if (!project.question) return toast("Add a research question first.");
  if (!hasUnrecordedChanges(project)) return toast(`Nothing has changed since version ${latestVersion(project).number}. Edit the question or hypothesis first.`);
  const button = $("#record-version");
  button.disabled = true; button.textContent = project.hypothesis ? "Recording and splitting…" : "Recording…";
  const note = $("#version-note").value.trim();
  const linkedCardIds = [...document.querySelectorAll("#version-link-list input:checked")].map(input => Number(input.value));
  try {
    $("#version-note").value = "";
    document.querySelectorAll("#version-link-list input:checked").forEach(input => { input.checked = false; });
    const result = await recordVersion(project, { note, linkedCardIds });
    const split = result.guesses ? ` Your hypothesis was split into ${result.guesses} ${result.guesses === 1 ? "guess" : "guesses"}${result.method === "basic" ? " (one per sentence, without AI)" : ""}.` : "";
    toast(`Version ${result.version.number} recorded.${split}`);
  } finally {
    button.disabled = false; button.textContent = "Record this version";
  }
}

const diffHtml = parts => parts.map(part => part.type === "add" ? `<ins>${escapeHtml(part.text)}</ins>` : part.type === "del" ? `<del>${escapeHtml(part.text)}</del>` : escapeHtml(part.text)).join(" ");

function fieldHtml(label, before, after, first) {
  let body;
  if (first) body = after ? escapeHtml(after) : `<span class="version-muted">Not stated</span>`;
  else if (before === after) body = `<span class="version-muted">Unchanged</span>`;
  else body = diffHtml(wordDiff(before, after));
  return `<p class="rail-label">${label}</p><p class="version-text">${body}</p>`;
}

export function renderVersionStatus() {
  const project = currentProject();
  const latest = latestVersion(project);
  $("#version-status").textContent = !latest ? "No versions recorded yet." : hasUnrecordedChanges(project) ? `Edited since version ${latest.number}. Record a new version to keep this change in the history.` : `Matches version ${latest.number}.`;
}

export function renderHistory() {
  const project = currentProject();
  const checked = new Set([...document.querySelectorAll("#version-link-list input:checked")].map(input => input.value));
  const linkable = project.cards.filter(item => item.state !== "rejected" && !isHypothesis(item)).sort((a, b) => (b.state === "approved") - (a.state === "approved"));
  $("#version-link-list").innerHTML = linkable.length ? linkable.map(item => `<label class="version-link"><input type="checkbox" value="${escapeHtml(item.id)}" ${checked.has(String(item.id)) ? "checked" : ""} /><span>${escapeHtml(item.claim)}</span></label>`).join("") : `<p class="version-muted">No evidence cards yet.</p>`;
  $("#version-link-count").textContent = `(${checked.size} selected)`;
  renderVersionStatus();

  const cardById = new Map(project.cards.map(item => [item.id, item]));
  const versions = project.versions;
  $("#version-timeline").innerHTML = versions.length ? versions.slice().reverse().map(version => {
    const previous = versions[version.number - 2];
    const guesses = project.cards.filter(item => item.versionId === version.id);
    const linked = (version.linkedCardIds || []).map(id => cardById.get(id)).filter(Boolean);
    return `<li class="version-item">
      <header><strong>Version ${version.number}</strong><small>${new Date(version.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · ${relativeTime(version.createdAt)}</small></header>
      ${version.note ? `<p class="version-note">${escapeHtml(version.note)}</p>` : ""}
      ${fieldHtml("QUESTION", previous?.question, version.question, !previous)}
      ${fieldHtml("HYPOTHESIS", previous?.hypothesis, version.hypothesis, !previous)}
      ${guesses.length ? `<p class="rail-label">GUESSES</p><ul class="version-list">${guesses.map(item => `<li>${escapeHtml(item.claim)}${item.superseded ? ` <span class="superseded-tag">superseded</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${linked.length ? `<p class="rail-label">LINKED EVIDENCE</p><ul class="version-list">${linked.map(item => `<li>${escapeHtml(item.claim)} <small>${escapeHtml(cardLocation(item))}</small></li>`).join("")}</ul>` : ""}
    </li>`;
  }).join("") : `<li class="version-empty">No versions yet. Record one to start a history of how your question and hypothesis change.</li>`;
}
