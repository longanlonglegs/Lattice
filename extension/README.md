# Lattice Capture extension

This extension adds **Save selection to Lattice** to Chrome's right-click menu, with a choice of where the passage comes from: **As an external source** or **As my experiment**.

## Load it locally

1. Start Lattice with `npm start` and open it (by default `http://localhost:4173`; any port on `localhost` or `127.0.0.1` works).
2. Visit `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked**.
3. Select this `extension/` folder.
4. On any page, select a passage, right-click, and choose **Save selection to Lattice** → the kind of source it is.

The extension sends only the selected passage, page title, URL, and your choice of origin to Lattice. It finds an open Lattice tab on localhost (whatever the port) and focuses it. If Lattice isn't open, it keeps the capture in Chrome's session storage, opens Lattice at the address where it last found it (or `http://localhost:4173`), and delivers the capture once the tab loads.

After changing the extension files, press Chrome's **Reload** button for Lattice Capture on `chrome://extensions` before testing again.
