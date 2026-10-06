# Lattice — Project Status

*Last updated: 2026-10-07 (Parts 6 and 7). A dated record of the vision and of how far the code has got. For how to run the app, see [README.md](README.md). For the plan to build what's missing, see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); known limitations kept for later are in [FUTURE_WORK.md](FUTURE_WORK.md). A fictional test project lives in [demo/vitamin-c/](demo/vitamin-c/).*

---

## 1. Vision

**One-liner:** Identify, organise, and connect ideas to make research faster.

**Problem:** Literature review is tedious. It is easy to miss key ideas, and hard to organise them or see how they relate.

**Audience:** Researchers doing a literature review.

**Abstract:** Researchers lose time to scattered sources, AI summaries they cannot check, and evidence they forget they have already read. They are not short of information. Lattice is a local-first research workspace. Users import papers, PDFs, and passages captured in the browser. Lattice turns these into evidence cards anchored to exact quotes, and every claim is checked word-for-word against its source. Users label each passage as supporting, contradicting, or questioning their hypothesis. Unlike a chatbot, Lattice remembers. It flags contradictions across projects, records how hypotheses change as evidence comes in, and checks drafts against the user's own verified evidence.

> **Direction since 2026-10-05:** the **idea web** is becoming Lattice's main feature. Each project opens on a physics-driven 2D network of every idea in it: claims from external sources, results from the user's experiments, claims from their drafts, and the individual guesses in their hypothesis. The AI draws relationships between ideas automatically (supports, contradicts, refines, same claim, explains). Manual "supports / contradicts" labels on cards were **removed**. Classification returns **by origin** instead (External · My experiment · My draft · My hypothesis), shown by node colour and shape. Contradiction alerts are scoped **per project** for now, not across projects. Drafts are checked by processing them as evidence and showing how their claims connect.

**How we differ from ChatGPT:** the idea web of AI-drawn relationships between *your* evidence (Connect‑2), hypothesis history (Connect‑3), and checking drafts against your evidence (Connect‑4).

**How we differ from Elicit:** Elicit has no hypothesis history and no draft checker, and it does not relate evidence to *your* hypothesis and your own experiments. Lattice also keeps data private because it is local-first.

---

## 2. Architecture at a glance

| Piece | File(s) | Notes |
|---|---|---|
| Local server + AI proxy | [server/](server/): [index.js](server/index.js) (http + routing, static files) · [openai.js](server/openai.js) (`callOpenAI`, response schemas) · [prompts.js](server/prompts.js) (every system prompt) · [config.js](server/config.js) (limits) · [json.js](server/json.js) · [routes/](server/routes/) `extract.js`, `fetch-source.js`, `lookup-doi.js`, `hypothesis.js`, `relations.js`, `analysis.js` | Plain Node `http` (CommonJS), no framework. `npm start` runs `server/index.js`, serving the project folder on `127.0.0.1:4173` (or `PORT`). Seven API routes: `POST /api/fetch-source` (fetches a link, parses PDFs server-side), `POST /api/extract-cards` (AI card extraction with verbatim quote check), `POST /api/evidence-analysis` (AI stress-test), `POST /api/lookup-doi` (Crossref metadata by DOI), `POST /api/split-hypothesis` (splits the hypothesis into 1–5 guesses), `POST /api/embed` (claim embeddings), `POST /api/relate` (judges how pairs of claims relate). `fetch-source` also returns a source's citation details (meta tags, PDF document info, Crossref). Route modules export their pure helpers for testing. |
| Frontend (single page) | [index.html](index.html), [styles.css](styles.css), [src/](src/): `main.js` (event wiring, startup) · `state.js` (workspace, saving, project helpers) · `db.js` (IndexedDB) · `records.js` (pure helpers: migration, store records, quote check, source metadata and citations) · `origins.js` (origin labels/colours/shapes) · `views.js` (view switching, top bar) · `projects.js` (Projects page, sidebar list) · `project-shell.js` (project tabs, Add evidence drawer) · `history.js` (Question & history: versions, timeline, hypothesis guesses) · `pipeline.js` (background relationship pipeline) · `relations.js` (pure: similarity, candidate pairs, relation labels and styles) · `web/web-view.js` (the idea web, d3) · `workspace.js` (sources and their details, activity, Markdown export) · `cards.js` (review list) · `judgment.js` (Insights tab, AI stress-test) · `library.js` (Library, Saved evidence) · `onboarding.js` (setup + settings) · `ingest.js` (links, files, paste, capture, extraction) · `privacy.js` (backup/restore/delete) · `util.js` | Vanilla JS ES modules loaded from `src/main.js`, with no build step and no framework. Each render re-sets `innerHTML`. Modules import each other in cycles, which is safe because only `main.js` runs code at load time: it awaits `initWorkspace()` and then wires up the page. |
| Landing page | [landing.html](landing.html), [landing.css](landing.css) | Standalone marketing page for the beta. Still advertises stance labels and Anki export (*rewrite in Part 10*). |
| Chrome extension | [extension/](extension/) | MV3. Adds a right-click "Save selection to Lattice" item that posts the selection into an open Lattice tab. |
| Persistence | IndexedDB database `lattice` | Stores: `projects`, `sources`, `cards`, `meta` (the workspace, rewritten on every save, one save at a time) · `texts` (full page text per source, written once at import) · `embeddings` (one 512-number vector per card and wording) and `edges` (one judged verdict per card pair, "none" included) · `annotations`, `versions` (still empty; versions live on the project). On first load, an old `localStorage` workspace (`lattice-local-workspace-v1`) is copied in; the old key is kept as a backup until **Delete local data**. A failed save shows a toast (with a specific message when storage is full). |
| Graph | `d3` v7 (UMD build) | Loaded by a plain `<script>` from `node_modules/d3/dist/d3.min.js` (the separate d3-force/drag/zoom packages use bare imports, which need a build step). |
| PDF parsing | `pdfjs-dist` (legacy build) | In the browser for uploads (loaded from `node_modules/` at runtime); on the server for fetched links, which needs the native `@napi-rs/canvas` package for your platform (`npm install`). |
| AI | OpenAI Responses API, default `gpt-5-mini` (`OPENAI_MODEL`) | Needs `OPENAI_API_KEY` in the server's environment. Strict JSON schemas for every call. Embeddings use `text-embedding-3-small` at 512 dimensions (`OPENAI_EMBEDDING_MODEL`). |
| Demo data | [demo/vitamin-c/](demo/vitamin-c/) | Fictional chemistry project (sources, experiments, a draft) with an answer key of built-in tensions. |
| Older planning docs | [docs/archive/](docs/archive/) | Launch checklist and roadmap from the earlier "research copilot / Anki" framing, superseded by the implementation plan. |
| Tests and lint | [test/](test/), [eslint.config.js](eslint.config.js) | `npm test` runs `node:test` unit tests for quote verification, page capping, link normalisation and private-host blocking, HTML-to-text, the AI routes (prompt routing and error handling) with OpenAI stubbed, `src/records.js` (card migration, store records, quote check), source metadata (meta tags, Crossref mapping and route, citation formatting, PDF info), hypothesis versions (word diff, sentence fallback, the split-hypothesis route), and relationships (candidate-pair selection, relation labels, the embed and relate routes). `npm run lint` runs ESLint (recommended rules). Other browser modules aren't unit-tested because they touch the DOM. |
| Repo setup | [.gitignore](.gitignore), [package.json](package.json) | `node_modules/`, `.env`, logs, and OS junk are ignored. Dependencies come from `npm install`, which also fetches the platform's `@napi-rs/canvas` binary. |

**Data model (informal, current):**
`workspace { activeId, projects[] }`
→ `project { id, title, colour, question, hypothesis, cards[], sources[], activities[], versions[], aiAnalysis, acknowledgedAt, createdAt, updatedAt, placeholder? }`
→ `card { id, claim, quote, location, sourceId, origin: external|experiment|draft|hypothesis, state: pending|approved|rejected, note, quoteMissing?, editing? }`. Old flashcards are migrated on load: `claim = answer`, `location = page`, and `question`/`tag`/`stance` are dropped.
→ `source { id, title, kind: pdf|text|web|url|work, origin: external|experiment|draft, detail, originalUrl?, capturedText?, fetched?, extraction: ai|basic, addedAt?, meta? }` (`kind: work` means your own work, experiment or draft)
→ `source.meta { title?, authors[]?, year?, venue?, doi?, url? }` for external sources only (Part 4B).
→ `texts { sourceId, pages: [{ label, text }] }` in its own store.

→ `version { id, number, question, hypothesis, note, linkedCardIds[], createdAt }` in `project.versions`. Hypothesis guesses are cards with `origin: hypothesis`, `sourceId: ""`, `versionId`, and `superseded: true` once a later version changes the hypothesis.

→ `edge { id: "a|b", projectId, a, b, aText, bText, relation: supports|contradicts|refines|same|explains|none, direction: a_to_b|b_to_a|none, confidence, rationale, similarity }` in the `edges` store; `embedding { id, projectId, cardId, text, vector }` in `embeddings`. `project.webLayout { cardId: [x, y, pinned] }` keeps the web's positions.

*Planned changes:* annotations (Part 8).

**UI (current):** The project header shows a status chip for the relationship pipeline ("Connecting ideas… N pairs left" / "Ideas up to date" / "Paused: AI not configured"). The left nav has five views: Projects, Workspace, Library, Saved evidence, and Privacy & data, plus a "Recent projects" list. New projects go through a four-step setup (Basics → Research focus → Your work so far → Privacy), and Project settings reuses that form. A project opens on its **Web** tab and has five tabs: **Web** (the idea web: pan/zoom, drag to pin, legend filters, search, side panel) · **Cards** (review list, origin filter) · **Sources** (remove, Edit details) · **Question & history** (question, hypothesis, Record this version, version timeline, research trail) · **Insights** (counts, next steps, AI stress-test). **+ Add evidence** opens a drawer from any tab. The URL hash remembers the tab (`#workspace/cards`).
*Planned:* notes and sticky notes on the web (Part 8); "Needs attention" side panel and the Insights rewrite (Part 9).

---

## 3. Feature status vs. vision

Legend: ✅ done · 🟡 partial / placeholder · ❌ not started · ➖ removed by decision. The **Plan** column points to the part of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) that finishes it (FW = [FUTURE_WORK.md](FUTURE_WORK.md), OOS = out of scope).

### Find
| # | Feature | Status | Plan | Notes |
|---|---|---|---|---|
| F1 | Import files (PDF, arXiv, others) | 🟡 | OOS | Upload: text-based PDF, `.txt`, `.md`. Paste text. **Links are fetched:** arXiv reads the full PDF; DOIs and publisher pages use `citation_pdf_url` when it's public, otherwise the landing page (usually the abstract); ordinary pages become plain text. **Source details** (title, authors, year, venue, DOI) come from page meta tags, PDF document info, Crossref, or the first page's text, and can be edited. Scanned PDFs (OCR) and `.docx` are out of scope. |
| F2 | Browser selection capture | ✅ | 10 | Works (Chrome only). Part 10 fixes the extension's reliability issues and lets captures carry an origin. |
| F3 | Automatic claim extraction | ✅ | FW | AI extraction for every source, with four prompts (general content, links, my experiment, my draft). Up to 8 cards per source. Each is a general, standalone scientific claim (subject, effect, conditions, numbers, hedging kept) plus the quote that best supports it. The server drops any card whose quote isn't found: every sentence must appear word-for-word, in order, on one page, and skipped text is shown as " … ". Falls back to rule-based "basic extraction" without AI. Only the first ~60k characters are read (FW). |
| F4 | Source library (persistent memory) | ✅ | — | Library view across projects, with search and a project filter. Shows "Authors (year) · Venue" for each source. Limited to one browser profile (accounts/sync OOS). |
| F5 | Your own work as evidence | ✅ | — | Uploads and pastes ask **Where is this from? External source / My experiment / My draft**, per item in setup step 3 and in the **+ Add evidence** drawer. Experiments extract results and conclusions; drafts extract the assertions the draft makes. |

### Organise
| # | Feature | Status | Plan | Notes |
|---|---|---|---|---|
| O1 | Multiple projects | ✅ | — | Projects page (most recent first, colour tag, stats, search), recent-projects sidebar, four-step setup with a required privacy acknowledgement, Project settings, delete project. |
| O2 | Evidence cards | ✅ | — | Each card shows its claim, quote, location, and origin badge, grouped by source. Edit changes the claim or quote. They live in the **Cards** tab (filterable by origin) and show a short citation such as "Okafor & Lindqvist 2019". |
| O3 | Stance labels | ➖ | — | Removed 2026-10-05. Replaced by **origin classification** (O7) and AI relationships in the web (C2). |
| O4 | Approve / reject cards | ✅ | — | Saved cards go to the cross-project **Saved evidence** view. Rejected cards are excluded from AI analysis and the web. |
| O5 | Activity trail | 🟡 | 10 | Logs creation, settings changes, imports, captures, approvals, and AI runs, but only the last 30 per project. Part 10 keeps the full history and logs claim edits and version changes. |
| O6 | Export (.md / .json) | 🟡 | 10 | Per-project Markdown and full-workspace JSON backup/restore. Part 10 adds per-project JSON export/import and puts relations and versions in Markdown. |
| O7 | Origin classification | ✅ | — | External · My experiment · My draft · My hypothesis, shown as coloured badges on cards and saved evidence (defined once in `src/origins.js`). The web uses the same colours plus a shape per origin (circle, square, rounded box, diamond). |
| O8 | Annotations | ❌ | 8 | Notes on ideas and free sticky notes on the web canvas. |

### Connect
| # | Feature | Status | Plan | Notes |
|---|---|---|---|---|
| C1 | Evidence balance + suggestions | ✅ | 9 | The **Insights** tab shows counts of sources, own work, cards, and saved cards, plus rule-based next actions and the opt-in AI stress-test. Part 9 splits it: "Needs attention" in the web side panel, counts, suggestions and stress-test in an Insights tab. |
| C2 | Idea web: automatic relationships (contradiction alerts) | 🟡 | 9 | **Done:** a background pipeline (embeddings pick each idea's most similar ideas from other sources; the AI judges supports / contradicts / refines / same / explains with a rationale) and a physics-driven web with colour/shape by origin, drag-to-pin, pan/zoom, legend filters, search, and a side panel listing each idea's relations. Relations also show under each card. **Part 9:** open contradictions listed in "Needs attention". One web per project. *Differentiator.* |
| C3 | Hypothesis / RQ history + timeline | ✅ | 7 | **Record this version** in Question & history saves the question and hypothesis with an optional note and linked evidence cards. The timeline shows each version with a word diff, its note, its guesses, and linked evidence. When the hypothesis changes, the AI splits it into 1–5 guesses (one per sentence without AI), which become hypothesis cards; earlier guesses are marked superseded. Setup records version 1. Part 7 shows the current guesses as web nodes. *Differentiator.* |
| C4 | Draft checker | 🟡 | 9 | Drafts are processed like any evidence, and their claims connect to the evidence in the web (supported / contradicted by …). Part 9 lists draft claims without supporting evidence in "Needs attention". *Differentiator.* |

### Cross-cutting promises in the abstract
| Promise | Status | Plan | Notes |
|---|---|---|---|
| "Every claim verified word-for-word against its source" | ✅ | — | AI-extracted quotes are checked verbatim at extraction time, and the full source text is stored. Editing a quote re-checks it and shows **⚠ Quote not found in source** if it no longer matches. Sources imported before Part 2 have no stored text, so their quotes can't be re-checked. |
| Local-first / privacy | ✅ | — | Data lives only in this browser's IndexedDB. When a key is configured, every source's text is sent to OpenAI for extraction, and each card's claim (plus the project question) is sent to find relationships; users accept both through a required acknowledgement when creating a project. The AI stress-test keeps its own opt-in. |

### Removed
- **Anki export** and the flashcard (question / reveal answer) layout. Removed in Part 3 (2026-10-06).

---

## 4. Known issues & tech debt

**Fixed since 2026-10-05 morning:** imports no longer replace a project's cards; new projects no longer get the sample layer-norm cards; removing a source removes its cards; card IDs come from a monotonic counter; the server's startup log shows the real port; the default demo question is gone.

**Done 2026-10-07 (Parts 6 and 7):** the AI relationship pipeline and the idea web.

**Done 2026-10-06 (Part 5):** hypothesis versions with a diff timeline, and the hypothesis split into guesses that are cards of their own.

**Done 2026-10-06 (Parts 4 and 4B):** the 4-step stepper and right-hand rail are replaced by project tabs with an Add evidence drawer, and sources have editable citation details.

**Fixed 2026-10-06 (Parts 2–3):** storage moved from `localStorage` (about 5 MB, with silent failures) to IndexedDB, and a failed save now shows a message. Old cards' unused `stance` and flashcard fields are migrated away. Anki export, which could report success after an AnkiConnect error, is gone.

**Fixed 2026-10-06 (Part 1B):** there are now unit tests (`npm test`, Node's built-in runner, OpenAI stubbed) and ESLint (`npm run lint`).

**Fixed 2026-10-06 (Part 1):** `app.js` and `server.js` are split into `src/` and `server/` modules with no change in behaviour.

**Fixed 2026-10-06 (Part 0):** `node_modules/` is no longer committed (a `.gitignore` covers it, `.env`, and OS junk); the old `outputs/` planning docs moved to `docs/archive/`.

**Fixed 2026-10-06 (code review):** page titles/authors containing an apostrophe were cut off, and meta tags were only read in one attribute order; a PDF still being read was silently left out when creating a project (creation now waits); revealing or opening a card for editing no longer counts as "worked on" on the Projects page; IDs and other stored values are now escaped in HTML, so a crafted backup file can't inject markup; the server now frees parsed PDFs.

| Issue | Plan |
|---|---|
| Restoring a backup only checks the top-level structure. | OOS |
| Every save rewrites all project, source, and card records (full texts excluded). Fine at today's sizes; see FUTURE_WORK. | FW |
| **Security:** the server serves every file in the project folder (incl. `.git/`, and an `.env` if one existed). | FW |
| **Security:** any website can trigger `/api/*` while Lattice runs (cross-site `text/plain` POST), spending OpenAI credit or fetching URLs. | FW |
| Extraction is slow (8–40 s), can't be cancelled, and has no queue. | 10 |
| Onboarding keeps you on the progress screen while it reads your work. | 10 |
| Only the first ~60k characters of a source are read. | FW |
| Link fetching scrapes pages directly instead of using arXiv/Crossref/OpenAlex for full text. | OOS (metadata via Crossref in 4B) |
| Extension: unused `lattice-bridge.js`; `pendingCapture` lost if the service worker stops; port `4173` hard-coded. | 10 |
| Extension is Chrome only. | OOS |
| Landing page advertises stance labels and Anki export. | 10 |
| Sidebar user "Logan D." is hard-coded; `•••` buttons do nothing. | 10 |
| Below 850 px the sidebar is hidden and Projects is hard to reach. | 10 |

---

## 5. Next steps

Follow [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) in order, one part per session, checking each part's "Done when" list before moving on. Read its "Rules for working through this plan" first: ask the user rather than guess, and update this file and the plan after every part.

**0** repo hygiene → **1** modules → **1B** tests & lint → **2** IndexedDB + stored text → **3** evidence cards & origins → **4** project tabs → **4B** source metadata → **5** hypothesis versions → **6** relationship pipeline → **7** idea web → **8** annotations → **9** insights → **10** leftovers.

Use [demo/vitamin-c/](demo/vitamin-c/) as test data; its README lists the relationships Lattice should find.
