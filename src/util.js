// Small helpers shared by every module.

export const $ = (selector) => document.querySelector(selector);
export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
// A Lattice-styled stand-in for window.confirm. Resolves true only when the confirm button is pressed;
// Escape, Cancel, and clicking the backdrop all resolve false.
export function confirmDialog({ title, message = "", confirmLabel = "Delete", cancelLabel = "Cancel", danger = true }) {
  let dialog = $("#confirm-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "confirm-dialog"; dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", "confirm-title"); dialog.setAttribute("aria-describedby", "confirm-message");
    dialog.innerHTML = `<h2 id="confirm-title"></h2><p id="confirm-message"></p><div class="confirm-actions"><button class="ghost-button" type="button" value="cancel"></button><button class="confirm-ok" type="button" value="ok"></button></div>`;
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close("cancel"); // a click on the backdrop
      else if (event.target.closest("button")) dialog.close(event.target.closest("button").value);
    });
    document.body.append(dialog);
  }
  dialog.querySelector("#confirm-title").textContent = title;
  dialog.querySelector("#confirm-message").textContent = message;
  dialog.querySelector("#confirm-message").hidden = !message;
  dialog.querySelector("[value=cancel]").textContent = cancelLabel;
  const ok = dialog.querySelector("[value=ok]");
  ok.textContent = confirmLabel; ok.classList.toggle("danger", danger);
  dialog.returnValue = "cancel";
  dialog.showModal();
  (danger ? dialog.querySelector("[value=cancel]") : ok).focus(); // Enter shouldn't delete by reflex
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true }));
}

// A short message, optionally with one action button (e.g. { label: "Undo", run }), which stays up a little longer.
export function toast(message, action) {
  const node = $("#toast"); node.textContent = message;
  if (action) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "toast-action"; button.textContent = action.label;
    button.addEventListener("click", () => { node.classList.remove("show"); action.run(); });
    node.append(button);
  }
  node.classList.toggle("has-action", Boolean(action));
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), action ? 6000 : 4000);
}
export const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
export function relativeTime(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
