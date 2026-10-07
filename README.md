# Lattice — Research Copilot v1

Lattice is a deliberately focused, local-first research workflow:

1. Create a project: name and colour, research question and hypothesis, any of your own finished work (experiment logs, drafts), and a required privacy acknowledgement.
2. Add a paper URL, DOI, PDF, or pasted text, and say where it's from: an external source, your experiment, or your draft.
3. Lattice extracts evidence cards with AI (with a rule-based fallback): each is one claim plus the exact quote it rests on.
4. Review the cards (grouped by source); edit, save, or reject each one.
5. Export the research record as Markdown.

## Run it

Requires Node 18+.

```bash
npm install
npm start
```

Then open `http://localhost:4173` (set `PORT` to use another port). `node_modules/` is not committed, so `npm install` is required after cloning: the browser loads `pdf.js` from `node_modules/`, and the server reads PDFs from links with `pdfjs-dist`, which needs the native `@napi-rs/canvas` binary for your platform. npm installs the right one automatically; if you copy `node_modules/` between machines (for example Windows → macOS), run `npm install` again so link-fetching of PDFs keeps working.

### Tests and lint

```bash
npm test        # unit tests (Node's built-in runner; OpenAI is stubbed, so no key or network needed)
npm run lint    # ESLint
```

Linting needs Node 18.18 or newer. Tests live in [test/](test/).

To try every feature with ready-made (fictional) material, follow [demo/vitamin-c/README.md](demo/vitamin-c/README.md).

## Current prototype behavior

The UI is fully interactive. The **Projects** page lists every project as a card, most recently worked on first, with a colour tag and counts of sources, cards, and saved cards; the sidebar shows the four most recent. New projects go through a four-step setup (Basics, Research focus, Your work so far, Privacy), and **Project settings** edits the same fields later or deletes the project. Opening a project lands on its **Web** tab (the idea web, below); the other tabs are **Cards** (the review list, filterable by origin), **Sources** (with remove and **Edit details**), **Question & history** (question, hypothesis, a version history, and the research trail), and **Insights** (counts, suggested next steps, and the AI stress-test). **+ Add evidence** opens a drawer (link, upload, or paste, plus **Where is this from?**) from every tab, and the URL hash remembers the tab (for example `#workspace/cards`). Each project stores its research question, hypothesis, sources (including their full text), cards, and approval state in the browser's IndexedDB. A workspace from an older version kept in `localStorage` is copied over automatically the first time the new version loads. Cards accumulate: every new source adds cards, and removing a source removes its cards. Pasted text, Markdown, and text-based PDFs are parsed locally in the browser. Every card shows a one-sentence claim, the verbatim quote, its location (PDF cards keep their page number), and an origin badge (External source, My experiment, or My draft). Editing a quote re-checks it against the stored source text and shows "Quote not found in source" if it no longer matches. For a URL or DOI, the local server fetches the page; arXiv links and publisher pages that expose a `citation_pdf_url` are read as full PDFs, and paywalled pages fall back to whatever is public (usually the abstract). If a link cannot be read, it is saved as a reference without cards. External sources also get **details** (title, authors, year, journal/venue, DOI, URL), taken cheapest first from the page's `citation_*` meta tags, the PDF's document info, a Crossref lookup by DOI (only the DOI is sent), and finally whatever title/authors/year the extraction model reads off the first page. Sources and the Library show "Authors (year) · Venue", cards show a short citation such as "Okafor & Lindqvist 2019", and **Edit details** (with **Fill from DOI**) fixes anything wrong. Your own experiments and drafts get no details, just their label and the date added. Markdown export creates a portable record of the question, hypothesis guesses, sources (as simple references), evidence with its relations and notes, the version history, and sticky notes. **Privacy & data** can back up or restore everything, or export a single project to a file and import it again (always as a copy).

## The idea web

A project opens on its **Web** tab, a canvas of cards. Your current hypothesis guesses are large dark cards on a ring in the middle, each with a tally of the evidence for and against it. Every piece of evidence is a smaller card, coloured by where it came from (external source blue, my experiment green, my draft amber), with a short AI-written headline. It gathers around the guess it bears on most; evidence with no link to the hypothesis sits in an outer band. Lines show how ideas relate: **supports** (green arrow), **contradicts** (red dashed), **refines** (grey arrow), **same claim** (purple double line), **explains** (orange arrow); thicker lines are more certain.

Lattice finds these relationships in the background, with no button: it embeds each claim (OpenAI `text-embedding-3-small`), pairs every idea with every current hypothesis guess and with its 3 most similar ideas from *other* sources, and asks the model how each pair relates, 20 pairs per call. The web always draws links to the hypothesis. It draws links between two pieces of evidence only when they matter (a confident contradiction, repeated claim, or explanation), or when a card has no hypothesis link, with at most 2 per card. **Show all connections** draws the rest. Every verdict is stored, so a reload makes no new API calls and editing one claim only re-checks that claim. The chip in the project header shows progress ("Connecting ideas… 40 pairs left", "Ideas up to date", or "Paused: AI not configured"; click it to retry).

Drag the background to pan, scroll to zoom, and **Fit to view** to see everything. Drag a card to pin it where you drop it (double-click to unpin); positions are saved. Hovering highlights a card's neighbours, and clicking opens a side panel with the full claim, its quotes, and every relation with the model's one-line reason, including relations that aren't drawn. The legend chips filter by origin and relation type, and the search box highlights matching ideas (Enter jumps to the first). Relations also appear under each card in the **Cards** tab.

Your own marks: add a **note** to any idea from its side panel (or a card's Edit mode in the Cards tab); annotated cards show a ✎. **Double-click empty canvas** (or click **+ Sticky note**) to drop a sticky note you can type in, recolour, drag, and delete. Notes and sticky notes are saved with the project and included in the Markdown export and backups.

**Needs attention** (toolbar button on the web) lists contradictions between pieces of evidence, hypothesis guesses no evidence has touched yet, and draft claims that no source or experiment supports; clicking one takes you to the cards involved. The **Insights** tab counts ideas by origin and relations by type, suggests what to do next, and runs the optional AI stress-test, which now also sees your hypothesis guesses and the strongest relations.

## Adding evidence

**+ Add evidence** puts each link, file, or paste into the **import queue** (bottom right): items are read one at a time, each with its status and a **Cancel** button, while you keep working. New projects open straight away; the work you added during setup is read in the queue.

## Question and hypothesis history

Edit the question and hypothesis freely in **Question & history**. When your thinking has changed, click **Record this version**, optionally with a note on what changed and why and links to the evidence cards behind it. The timeline shows every version, newest first, with a word-by-word diff against the one before. Setup records version 1 automatically. Whenever the hypothesis changes, Lattice splits it into 1–5 separate, testable guesses (with AI; one per sentence without it). Each guess becomes a **My hypothesis** card, and the previous version's guesses are kept but marked *superseded*.

## Browser capture

The local Chrome extension in [`extension/`](extension/) adds **Save selection to Lattice** to the right-click menu, with a choice of **As an external source**, **As my experiment**, or **As my draft**. It works with Lattice on any localhost port. When Lattice is open, the extension sends only the selected text, page title, and URL to the active local project. The project’s research-memory timeline records the capture alongside imported sources and card decisions. See [`extension/README.md`](extension/README.md) to load it in Chrome.

Saved cards appear in **Saved evidence** in the left navigation, which gathers them across local projects.

## Grounded reasoning

Each project can include a working hypothesis. Cards are not labelled as supporting or contradicting it; each is simply a piece of evidence. The **Insights** tab shows counts of external sources, your own work, cards, and saved cards, plus rule-based next actions. It does not claim that a research area is unexplored or infer facts outside the saved project corpus.

## AI card extraction

When the server has `OPENAI_API_KEY` set, every new source (link, PDF, text file, pasted text, or browser capture) is turned into evidence cards by the model. Each card is one of the source's **main conclusions**, a standalone scientific claim that groups related findings (for example all the storage temperatures tested, with the overall trend), so a short source usually gives 1–2 cards and a full paper 2–4. Each card carries 1–3 verbatim quotes, with page labels, that hold the supporting details and numbers. The server checks that every sentence of each quote appears in the source text, in order (skipped text is shown as " … "), drops quotes it cannot find, and discards a card left with none. Only the first ~60,000 characters of a source are sent, and the app says when a source was truncated. Links use a separate prompt that tells the model to ignore site navigation and to stay within the abstract when only the abstract is available. For your own work, the **Where is this from?** choice (in project setup and in the **+ Add evidence** drawer) picks the prompt: **My experiment** extracts the main conclusions of your work (one per effect you studied, plus any anomaly and its suspected cause); **My draft** extracts the main arguments your draft makes. Both are phrased as your claims rather than established facts. The prompts live in `server/prompts.js` (`contentExtractionPrompt`, `linkExtractionPrompt`, `experimentExtractionPrompt`, `draftExtractionPrompt`, and `analysisPrompt` for the stress-test).

Creating a project requires acknowledging a privacy notice that explains this. Without a key, or if the AI call fails, Lattice falls back to basic rule-based extraction and labels the source "basic extraction".

## Optional AI evidence analysis

Lattice can optionally stress-test the evidence in the **Insights** tab. It is deliberately not a general research chatbot: the model receives only the active project’s research question, working hypothesis, and up to 12 non-rejected, source-anchored card excerpts (saved cards first), each marked as coming from an external source, the researcher’s own experiment, or their draft. The model judges for itself how each bears on the hypothesis. Links that could not be fetched and the rest of the local workspace are not sent.

Set an API key only in the local server environment, then start the app:

```bash
# macOS / Linux
OPENAI_API_KEY="your_key" npm start
```

```powershell
# Windows PowerShell (this terminal only)
$env:OPENAI_API_KEY = "your_key"; npm start
```

To keep the key across terminals on Windows, save it as a user environment variable with `[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "your_key", "User")`, then open a new terminal (restart VS Code if you use its terminal). The key lives in your Windows user settings, not in the repo.

You may set `OPENAI_MODEL` to choose another compatible model; the default is `gpt-5-mini`. The API key never enters browser code or browser storage. The user must check the one-time consent box and click **Analyze evidence** before any data leaves the device. The result is constrained to a short evidence read, tensions tied to supplied passage IDs, and next research actions; it is saved locally with the project.

## Privacy and beta safety

The **Privacy & data** view explains what Lattice stores locally and includes complete JSON backup (including stored source text), restore, and delete controls. Restore and deletion require confirmation. There is no Lattice account, remote database, or source-content telemetry in this prototype. Remote requests are: link fetching (to the site you entered), AI card extraction when a key is configured, and the consent-gated AI evidence analysis.

## Launch preparation

`landing.html` is a standalone public-facing page for the local beta. It contains the current positioning and links into the app, but it does not publish the product, collect sign-ups, create accounts, or charge users. Older launch notes from the earlier framing are archived in [docs/archive/](docs/archive/).

## Status and roadmap

- [PROJECT_STATUS.md](PROJECT_STATUS.md): what is built, what is partial, and known issues.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): the part-by-part plan, centred on the idea web. Read its rules before starting a part.
- [FUTURE_WORK.md](FUTURE_WORK.md): known limitations deliberately left for later.
