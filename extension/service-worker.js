// Lattice Capture: right-click a selection and send it to an open Lattice tab, tagged with where it came from.
// Lattice runs on localhost at any port; the extension finds its tab by title and remembers where it last saw it.
const DEFAULT_ORIGIN = "http://localhost:4173";
const choices = { "save-external": "external", "save-experiment": "experiment", "save-draft": "draft" };

function isLatticeTab(tab) {
  try {
    const url = new URL(tab.url || "");
    return ["localhost", "127.0.0.1"].includes(url.hostname) && /^Lattice\b/.test(tab.title || "") && !url.pathname.includes("landing");
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-selection", title: "Save selection to Lattice", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "save-external", parentId: "save-selection", title: "As an external source", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "save-experiment", parentId: "save-selection", title: "As my experiment", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "save-draft", parentId: "save-selection", title: "As my draft", contexts: ["selection"] });
});

async function deliverCapture(capture) {
  const tab = (await chrome.tabs.query({})).find(isLatticeTab);
  if (!tab) return false;
  try {
    await chrome.storage.local.set({ latticeOrigin: new URL(tab.url).origin });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: payload => window.postMessage({ type: "LATTICE_EXTENSION_CAPTURE", payload }, window.location.origin),
      args: [capture]
    });
    return true;
  } catch {
    return false;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const origin = choices[info.menuItemId];
  if (!origin || !info.selectionText || !tab?.url) return;
  const capture = { selection: info.selectionText, url: tab.url, title: tab.title || new URL(tab.url).hostname, origin };
  if (await deliverCapture(capture)) return;
  // No Lattice tab: keep the capture in session storage (it survives the service worker stopping) and open Lattice.
  await chrome.storage.session.set({ pendingCapture: capture });
  const { latticeOrigin } = await chrome.storage.local.get("latticeOrigin");
  await chrome.tabs.create({ url: `${latticeOrigin || DEFAULT_ORIGIN}/` });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isLatticeTab(tab)) return;
  const { pendingCapture } = await chrome.storage.session.get("pendingCapture");
  if (pendingCapture && await deliverCapture(pendingCapture)) await chrome.storage.session.remove("pendingCapture");
});
