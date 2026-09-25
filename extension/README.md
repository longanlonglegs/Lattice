# Lattice Capture extension

This extension adds **Save selection to Lattice** to Chrome’s right-click menu.

## Load it locally

1. Start Lattice with `npm start` and open `http://localhost:4173`.
2. Visit `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked**.
3. Select this `extension/` folder.
4. On any article or forum page, select a passage, right-click, and choose **Save selection to Lattice**.

The extension sends only the selected passage, page title, and URL to Lattice. It focuses an already-open Lattice tab after each capture; if Lattice is closed, it opens the local app and delivers the pending capture once the tab loads.

After changing the extension files, press Chrome’s **Reload** button for Lattice Capture on `chrome://extensions` before testing again.
