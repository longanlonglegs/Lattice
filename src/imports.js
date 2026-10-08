// The import queue: every source being read or extracted, one at a time, shown in a corner panel with a
// Cancel button. Adding evidence never blocks the page; cards appear in the project as each import finishes.
import { $, escapeHtml } from "./util.js";
import { icon } from "./icons.js";

const jobs = []; // { id, title, projectTitle, status: queued|running|done|failed|cancelled, note, controller, run }
let running = false;

const icons = { queued: icon("clock"), running: icon("spinner"), done: icon("check"), failed: icon("alert"), cancelled: icon("close") };

function renderQueue() {
  const panel = $("#import-queue");
  panel.classList.toggle("hidden", !jobs.length);
  if (!jobs.length) return;
  const active = jobs.filter(job => job.status === "queued" || job.status === "running").length;
  panel.innerHTML = `<p class="queue-head">${active ? `Importing · ${active} left` : "Imports finished"}</p><ul>${jobs.map(job => `
    <li class="queue-item ${job.status}"><span class="queue-icon">${icons[job.status]}</span><div><strong>${escapeHtml(job.title)}</strong><small>${escapeHtml(job.note)}${job.projectTitle ? ` · ${escapeHtml(job.projectTitle)}` : ""}</small></div>${job.status === "queued" || job.status === "running" ? `<button type="button" data-cancel-import="${job.id}">Cancel</button>` : ""}</li>`).join("")}</ul>`;
  panel.querySelectorAll("[data-cancel-import]").forEach(button => button.addEventListener("click", () => cancelImport(button.dataset.cancelImport)));
}

// Finished items stay for a few seconds so their result can be read, then leave the list.
function retire(job) {
  setTimeout(() => {
    const index = jobs.indexOf(job);
    if (index >= 0) jobs.splice(index, 1);
    renderQueue();
  }, job.status === "done" ? 6000 : 12000);
}

async function next() {
  if (running) return;
  const job = jobs.find(item => item.status === "queued");
  if (!job) return;
  running = true;
  job.status = "running";
  renderQueue();
  try {
    const note = await job.run(job.controller.signal, text => { job.note = text; renderQueue(); });
    job.status = "done";
    job.note = note || "Done";
  } catch (error) {
    job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    job.note = job.status === "cancelled" ? "Cancelled" : error.message || "Failed";
  }
  retire(job);
  running = false;
  renderQueue();
  next();
}

// run(signal, setNote) does the work and resolves to a short result ("3 cards"). It must stop when signal aborts.
export function enqueueImport({ title, projectTitle = "", run }) {
  jobs.push({ id: crypto.randomUUID(), title, projectTitle, status: "queued", note: "Waiting…", controller: new AbortController(), run });
  renderQueue();
  next();
}

export function cancelImport(id) {
  const job = jobs.find(item => item.id === id);
  if (!job) return;
  job.controller.abort();
  if (job.status === "queued") { job.status = "cancelled"; job.note = "Cancelled"; retire(job); renderQueue(); }
}

// Throws the same error a cancelled fetch would, so every step can stop the same way.
export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}
