if (!globalThis.__latticeBridgeInstalled) {
  globalThis.__latticeBridgeInstalled = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "LATTICE_CAPTURE") return;
    window.postMessage({ type: "LATTICE_EXTENSION_CAPTURE", payload: message.payload }, window.location.origin);
  });
}
