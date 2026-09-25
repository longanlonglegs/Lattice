let pendingCapture = null;

function isLatticeTab(tab) {
  return Boolean(tab.url?.startsWith("http://localhost:4173/") || tab.url?.startsWith("http://127.0.0.1:4173/"));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-selection", title: "Save selection to Lattice", contexts: ["selection"] });
});

async function deliverCapture(capture) {
  const tabs = (await chrome.tabs.query({})).filter(isLatticeTab);
  if (!tabs.length) return false;
  try {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (payload) => window.postMessage({ type: "LATTICE_EXTENSION_CAPTURE", payload }, window.location.origin),
      args: [capture]
    });
    return true;
  } catch {
    return false;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-selection" || !info.selectionText || !tab?.url) return;
  const capture = { selection: info.selectionText, url: tab.url, title: tab.title || new URL(tab.url).hostname };
  if (await deliverCapture(capture)) return;
  pendingCapture = capture;
  await chrome.tabs.create({ url: "http://localhost:4173/" });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!pendingCapture || changeInfo.status !== "complete" || !isLatticeTab(tab)) return;
  if (await deliverCapture(pendingCapture)) pendingCapture = null;
});
