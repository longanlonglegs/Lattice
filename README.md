# Lattice — Research Copilot v1

Lattice is a deliberately focused, local-first research workflow:

1. State the research question that gives the session its purpose.
2. Add a paper URL, DOI, PDF, or pasted text.
3. Extract source-grounded candidate claims.
4. Mark each passage as supporting, contradicting, or raising a question; then edit, approve, or reject its card.
5. Export the research record as Markdown or approved cards to Anki through AnkiConnect.

## Run it

Requires Node 18+.

```bash
npm start
```

Then open `http://localhost:4173`.

## Current prototype behavior

The UI is fully interactive. Create and switch between named research projects; each project stores its research question, sources, card edits, classifications, and approval state in browser local storage. Pasted text, Markdown, and text-based PDFs are parsed locally in the browser. PDF-derived cards retain their page number in the source anchor. URL/DOI entry stores a local research reference; network retrieval of linked sources is intentionally not part of this local-first release. Markdown export creates a portable record of the question, evidence, and classifications. Export sends approved cards to AnkiConnect at `http://127.0.0.1:8765`; if Anki or AnkiConnect is unavailable, the app keeps the approved state and reports that outcome.

## Browser capture

The local Chrome extension in [`extension/`](extension/) adds **Save selection to Lattice** to the right-click menu. When Lattice is open, the extension sends only the selected text, page title, and URL to the active local project. The project’s research-memory timeline records the capture alongside imported sources and card decisions. See [`extension/README.md`](extension/README.md) to load it in Chrome.

Approved cards now live in the **Cards** item in the left navigation. That separate library aggregates approved cards across local projects and is the only place where Anki export is offered.

## Grounded reasoning

Each project can include a working hypothesis. Lattice turns the user’s evidence labels—supports, contradicts, and open question—into a local evidence balance and structural next actions. It does not claim that a research area is unexplored or infer facts outside the saved project corpus.

## Optional AI evidence analysis

Lattice can optionally stress-test the evidence in the **Make a judgment** section. It is deliberately not a general research chatbot: the model receives only the active project’s research question, working hypothesis, and up to 12 source-anchored card excerpts from pasted text, PDFs, or browser captures. Saved links and the rest of the local workspace are not sent.

Set an API key only in the local server environment, then start the app:

```bash
OPENAI_API_KEY="your_key" npm start
```

You may set `OPENAI_MODEL` to choose another compatible model; the default is `gpt-5-mini`. The API key never enters browser code or local storage. The user must check the one-time consent box and click **Analyze evidence** before any data leaves the device. The result is constrained to a short evidence read, tensions tied to supplied passage IDs, and next research actions; it is saved locally with the project.

## Privacy and beta safety

The **Privacy & data** view explains what Lattice stores locally and includes complete JSON backup, restore, and delete controls. Restore and deletion require confirmation. There is no Lattice account, remote database, or source-content telemetry in this prototype. Optional AI analysis is the only remote request and is explicitly consent-gated in the interface.

## Launch preparation

`landing.html` is a standalone public-facing page for the local beta. It contains the current positioning and links into the app, but it does not publish the product, collect sign-ups, create accounts, or charge users. See `outputs/lattice-launch-checklist.md` for the remaining human approval and deployment steps.

## Production wiring (next implementation step)

- Resolve arXiv/DOI metadata with OpenAlex, Crossref, and arXiv—not general web scraping.
- Chunk source text into a local vector store such as LanceDB.
- Ask an LLM to emit cards only alongside a verbatim supporting span and source identifier. Reject any output without a source anchor.
- Persist sessions and cards locally (SQLite is sufficient for v1).
- Keep local notes indexing, citation graphs, and research-gap suggestions out of this first release.

This scope makes the core promise testable: every card is reviewable and traceable before it reaches a learner's Anki deck.
