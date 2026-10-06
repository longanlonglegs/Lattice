# Lattice — Implementation Plan

*Written 2026-10-05, updated 2026-10-06. Covers every feature in [PROJECT_STATUS.md](PROJECT_STATUS.md) that isn't built yet, reshaped around the **idea web** as Lattice's main feature. Each part is one implementation session that ends in something you can test. Parts are ordered so that each one builds only on parts before it.*

---

## Rules for working through this plan (read first)

These apply to anyone, human or AI agent, implementing a part.

1. **One part per session.** Finish a part, check its **Done when** list, and show the results (test output, screenshots, what was checked) before starting the next one.
2. **Don't make large assumptions or guesses.** If something isn't specified here or in the code, or a decision would change how the product behaves or what data leaves the device, **stop and ask the user** before building it. This includes product choices (UI behaviour, what the AI does, privacy) and anything that contradicts this plan or [PROJECT_STATUS.md](PROJECT_STATUS.md). Small, conventional implementation details don't need a question, but mention them in the summary.
3. **Update the docs after every part**, in the same session:
   - **This file:** mark the part as done (add `✅ Done YYYY-MM-DD` to its heading), note anything that turned out differently from the plan, and adjust later parts if the change affects them.
   - **[PROJECT_STATUS.md](PROJECT_STATUS.md):** update the architecture, data model, feature tables (status and Plan columns), and known issues so they describe the code as it now is, and set the "Last updated" date.
   - **[FUTURE_WORK.md](FUTURE_WORK.md):** record any limitation that was found but deliberately left for later.
   - **[README.md](README.md):** update it if setup steps or user-facing behaviour changed.
4. **Test with the demo project** in [demo/vitamin-c/](demo/vitamin-c/) where it applies; its README lists the relationships Lattice should find.

---

## The target, in one paragraph

Opening a project lands on its **idea web**: a 2D, physics-driven network of every idea in the project. Each node is one idea: a claim from an external source, a result from your experiments, a claim from your drafts, or one of the guesses in your hypothesis. Node colour and shape show where the idea came from. Lines show how ideas relate (supports, contradicts, refines, same claim, explains), and the AI draws them automatically in the background whenever ideas are added or changed. You can drag ideas around, pin them, attach notes, and drop sticky notes on the canvas. The flat **Cards** list, the **Sources** list, the **Question & history** timeline, and an **Insights** tab sit beside the web as tabs.

## Decisions this plan is built on

| Topic | Decision |
|---|---|
| Card shape | Evidence card: one-sentence **claim** + verbatim **quote** + location + source. No question/answer, no "reveal". **Anki export is removed.** |
| Classification | Brought back **by origin, not by stance**: External source · My experiment · My draft · My hypothesis. Shown by colour and node shape. |
| Connect (C2) | Replaced by the idea web: AI decides relationships automatically, with no button. Relationship types: **supports, contradicts, refines/extends, same claim, explains/causes**. |
| Web scope | **One web per project.** Cross-project links are out of scope for now. |
| Hypothesis | One hypothesis field per project. The AI **splits it into individual guesses**, and each guess is a hypothesis node. |
| Hypothesis history (C3) | Editing is free; a **"Record this version"** button saves a version with an optional note and linked cards. |
| Drafts (C4) | Drafts are processed **like any other evidence**: the AI extracts the draft's claims as "My draft" nodes. "Draft checking" becomes visible relationships in the web, plus a "draft claims with no evidence" list. |
| Annotations | **Notes on ideas** and **free sticky notes** on the canvas. (Editing or drawing connections by hand is *not* included.) |
| Layout | The project opens on the web. Tabs: **Web · Cards · Sources · Question & history · Insights**. The 4-step stepper is retired; "+ Add evidence" is available from every tab. |
| Judgment | Split. Things tied to the web (open contradictions, unsupported hypothesis guesses and draft claims) go in a **web side panel**. Counts, suggestions, and the AI stress-test go in an **Insights** tab. |

### Technical decisions (confirmed by the user 2026-10-06)
- **Graph library:** `d3-force` + `d3-drag` + `d3-zoom` from npm, served from `node_modules/` like pdf.js (no build step). Rendering is SVG, which is fine to roughly 300–400 nodes per project; canvas rendering is a later optimisation if needed.
- **Embeddings:** OpenAI `text-embedding-3-small` to find candidate pairs cheaply, then the chat model judges only those candidates (see Part 6).
- **Your-work types:** the existing "your own work" kind becomes **My experiment**. Uploads and pastes get a "Where is this from?" choice: External / My experiment / My draft.
- **Storage moves to IndexedDB**, because full source text and embeddings won't fit in `localStorage`'s ~5 MB.
- **Privacy:** relationship-finding sends card text (claims and quotes) to OpenAI. The setup acknowledgement text is updated to say so. No extra consent step.

---

## Part 0 — Repo hygiene ✅ Done 2026-10-06
**Goal:** a clean repo that anyone can set up with `npm install`.
- Add `.gitignore` (`node_modules/`, `.env`, OS junk).
- `git rm -r --cached node_modules` (local copy stays).
- README "Run it": `npm install` then `npm start`; note the server needs the platform's `@napi-rs/canvas` binary for PDF links.
- **Archive old docs:** move `outputs/` (launch checklist and roadmap from the old "Anki copilot" framing) to `docs/archive/` with a one-line note that they're superseded by this plan.

**Done when:** a fresh clone + `npm install` + `npm start` runs the app, link-fetching of an arXiv PDF works, `git status` no longer lists `node_modules`, and `outputs/` is gone from the repo root.

*As built:* matched the plan. The archive also has a `docs/archive/README.md` holding the "superseded" note. Checked by copying the tracked files (no `node_modules`) into a clean folder: `npm install` fetched only the Windows canvas binary, the app and `pdf.js` were served, and `https://arxiv.org/abs/1706.03762` was read as a 15-page PDF. The `.gitignore` also ignores `.env.*`, `*.log`, and `.vscode/`/`.idea/`.

---

## Part 1 — Split the code into modules (no behaviour change) ✅ Done 2026-10-06
**Goal:** make room for the web without one 840-line `app.js`.
- `app.js` → `src/` ES modules, loaded with `<script type="module" src="src/main.js">`:
  `main.js` (startup, wiring) · `state.js` (workspace, persist) · `views.js` (showView, top bar, sidebar) · `projects.js` (Projects page) · `onboarding.js` (setup + settings) · `ingest.js` (fetch, extract, add source) · `cards.js` (review list) · `library.js` (Library + saved cards) · `privacy.js` (backup/restore/delete) · `util.js` (escapeHtml, plural, relativeTime, toast).
- `server.js` → `server/`: `index.js` (http + routing) · `openai.js` (callOpenAI, schemas) · `prompts.js` (all system prompts) · `routes/extract.js`, `routes/fetch-source.js`, `routes/analysis.js`. `package.json` start script points to `server/index.js`.

**Done when:** the browser tests from the last two sessions (onboarding with work, link import, paste, settings, delete, legacy data) pass unchanged, with no console errors.

*As built:*
- The modules were cut from exact line ranges of `app.js` / `server.js` by a script, so the code inside each function is unchanged; only `export`/`import` lines were added. Four modules beyond the list above, because some code had no home in it:
  - `src/workspace.js`: the workspace stepper, source list, activity trail, `renderProject`, and Markdown export.
  - `src/judgment.js`: the Judgment step (counts, next actions, AI stress-test). Part 4 moves this into the Insights tab and Part 9 turns it into `src/insights.js`.
  - `server/config.js`: the shared limits (`MAX_SOURCE_CHARS`, `MAX_CARDS`, `MAX_DOWNLOAD_BYTES`).
  - `server/json.js`: `sendJson` / `readJson`.
- `workspace` is an exported live binding in `state.js`; restore and delete replace it with `setWorkspace()`, because ES modules can't assign to an imported name. The Anki export handler and the settings "Delete project" handler became named functions (`exportToAnki` in `library.js`, `deleteProject` in `onboarding.js`).
- The server's pure helpers (`verifiedCards`, `normalizeForMatch`, `capPages`, `normalizeSourceUrl`, `isPrivateHost`, `htmlToText`, …) are exported from their route modules so Part 1B can test them. `server/index.js` is the only file that starts the server.
- **Verified** with a scripted Chrome run (Puppeteer) of 35 steps against the old code and the new code side by side, without an API key: onboarding with pasted and PDF work, paste (external and own work), PDF and Markdown upload, arXiv link, unreadable link, approve/reject/reveal/edit, Judgment, inline hypothesis edit, source removal, browser capture, settings, a second project, Projects search, Library and Cards views, Anki export with Anki off, Markdown export, backup → delete → restore, project delete, reload on `#library`, and legacy `lattice-phase-zero-session` data. The saved workspace and visible text matched at every step, and so did the Markdown export. The only console errors were the expected ones, the same in both runs: 503 with no key, 502 for the unreadable link, AnkiConnect refused, and `favicon.ico` 404. With the key, all three extraction modes, the stress-test, and the browser's AI extraction + analysis flow also worked.
- Lint note for Part 1B: `no-unused-vars` needs `ignoreRestSiblings: true`, because `fetch-source.js` drops `pdfTitle` with a rest destructure.

---

## Part 1B — Tests and linting ✅ Done 2026-10-06
**Goal:** a safety net before the big changes start.
- **Tests** with Node's built-in `node:test` (no extra dependency): `test/` covers the pure logic first: quote verification (`verifiedCards`, `normalizeForMatch`), `capPages`, URL/DOI/arXiv normalisation and private-host blocking, `htmlToText`, and the extraction-mode → prompt routing. AI calls are stubbed, so tests never hit OpenAI.
- **Linting** with ESLint (flat config, `devDependencies`), browser globals for `src/` and Node globals for `server/`.
- `package.json` scripts: `npm test`, `npm run lint`.
- From here on, **every part adds tests for its own logic** (for example migration in Part 2, candidate-pair selection in Part 6).

**Done when:** `npm test` and `npm run lint` both pass on a clean checkout, and breaking quote verification on purpose makes a test fail.

*As built:*
- **Tests** are in `test/`: `quote-verification.test.js` (`normalizeForMatch`, `verifiedCards`, `capPages`), `fetch-source.test.js` (DOI/arXiv/URL normalisation, private-host blocking, `decodeEntities`, `metaContent`, `htmlToText`), and `routes.test.js` (which prompt each extraction mode uses, what is sent, validation, 400/500/502/503 handling, and the evidence-analysis route). That's 47 tests.
  - OpenAI is stubbed by replacing the global `fetch` in `test/helpers.js`, and the stub throws on any other URL, so a test can never reach the network. App code needed no changes for this.
  - `npm test` is plain `node --test`, which works on Node 18+. Node 22's default search also lists `test/helpers.js` as a file with no tests. That's harmless.
- **Lint:** `eslint.config.js` uses `@eslint/js` recommended rules plus `no-unused-vars` with `ignoreRestSiblings`. Globals: browser for `src/`, Node for `server/`, `test/` and `*.cjs`, browser + WebExtension for `extension/`. `npm run lint` names its folders (`src server test extension demo`) so the old `app.js` / `server.js` aren't linted while they're still on disk. The existing code passed with no changes.
- **Verified:** in a clean copy, `npm ci` → `npm test` (48/48 including the helpers entry) and `npm run lint` passed. Breaking verification on purpose failed tests both ways: accepting any quote failed 3 tests, and matching raw text instead of normalised text failed 3 others.
- **Not covered:** the browser-side `capPages` in `src/ingest.js`. Browser modules can't be imported in Node yet, because `state.js` reads `localStorage` and `util.js` touches the DOM as soon as they load. Part 2 should keep its pure logic (for example the migration) in modules that have no side effects when they load, so it can be tested.

---

## Part 2 — IndexedDB storage + stored source text ✅ Done 2026-10-06
**Goal:** a store that can hold full texts, embeddings, and the web, and make "verified word-for-word" true after the fact.
- New `src/db.js`: small IndexedDB wrapper. Object stores: `projects`, `sources` (incl. full page text), `cards`, `embeddings`, `edges`, `annotations`, `versions`, `meta`.
- One-time **migration** from the `localStorage` blob (kept as a backup key until the next version). Write the migration as a pure function in a module with no side effects at load time, so `node:test` can import and test it (see Part 1B notes).
- `ingest.js` saves each source's full page text (PDF pages, fetched link pages, pasted text).
- **Re-verification:** when a card's quote is edited, check it against the stored source text. Show a small "quote not found in source" badge if it no longer matches.
- `privacy.js`: backup/restore/delete cover all stores; storage-quota errors show a clear message instead of failing silently.

**Done when:** existing projects survive the migration intact; a reload keeps everything; a backup → delete → restore round-trip restores everything; editing a quote to nonsense shows the badge; importing many large PDFs doesn't hit a 5 MB wall.

*As built (Parts 2 and 3 were done together):*
- **Storage:** `src/db.js` has the stores from the plan, plus one more, `texts` (full page text keyed by `sourceId`). Sources and cards use a `[projectId, id]` key. The in-memory `workspace` object stays as it was. Each save rewrites the `projects`/`sources`/`cards`/`meta` records in one transaction, one save at a time (`saveNow`, `flushSaves` in `state.js`). Full text is written once at import and isn't rewritten on every keystroke. A save also deletes the stored text of any source that's gone.
- **Migration:** `initWorkspace()` reads IndexedDB. If it's empty, the old `localStorage` workspace is copied in and its key left in place as a backup (**Delete local data** removes it). The pure helpers (`migrateWorkspace`, `splitWorkspace`/`joinWorkspace`, `quoteInPages`) live in `src/records.js` and have unit tests.
- **Re-verification:** editing a quote (Part 3 made quotes editable) checks it against the stored text and saves a `quoteMissing` flag on the card, which shows **⚠ Quote not found in source**. Sources imported before this part have no stored text, so they never get the badge.
- **Backup** is now `version: 2`: the workspace plus the non-workspace stores (texts, and later embeddings, edges, annotations, versions). Restore accepts version 1 and version 2.
- **Verified** in Chrome: an old-format `localStorage` workspace migrated with its cards converted; a reload changed nothing in any store; backup → delete → restore gave back every store exactly; a nonsense quote showed the badge and the badge survived a reload; four 3 MB text files (about 12 MB of stored text) saved and reloaded.

---

## Part 3 — Evidence cards + origin categories (drop Anki) ✅ Done 2026-10-06
**Goal:** cards become evidence, and every idea has an origin.
- **Card model:** `{ id, claim, quote, location, sourceId, origin, state, note }`. Migrate old cards: `claim = answer`, drop `question`/`stance`.
- **Origins:** `external` (pdf/text/web/url) · `experiment` (old `work`) · `draft` (new) · `hypothesis` (Part 5). Defined once in `src/origins.js` with label, colour, and shape so the list and web stay consistent.
- `cards.js`: card shows claim, quote, location, and an origin badge; approve/reject stays. Remove reveal/flashcard UI.
- Add evidence: replace the "my own work" checkbox with **Where is this from? External / My experiment / My draft**. Same choice per item in setup step 3.
- `server/prompts.js`: card schema returns `claim` instead of `question`/`answer`; the experiment prompt is today's work prompt; new **draft prompt** extracts the assertions a draft makes (not results), phrased as the researcher's claims.
- Remove Anki: the export button and code, the Privacy copy, and the "Cards" nav becomes **Saved evidence**.

**Done when:** adding one external paper, one experiment log, and one draft produces claim cards with the right origin badge; old projects show migrated cards; no Anki references remain.

*As built:*
- **Cards** have no `tag` field: the model in the plan doesn't list it, so it was dropped along with `question`/`answer`/`stance`. Cards are grouped by source as before. Edit changes the claim and the quote. `note` exists on every card (empty) but has no UI yet; that's Part 8.
- **Sources** get `origin` as well. `kind` keeps the format (`pdf`/`text`/`web`/`url`), and own work, experiment or draft, still uses `kind: "work"`.
- **Origin choice:** "Where is this from?" is a dropdown under Upload/Paste (hidden on the Link tab, since links are external) and per item in setup step 3, where it defaults to My experiment. Browser captures are external.
- **Server:** extraction modes are `content` / `link` / `experiment` / `draft`, and `work` is still accepted as an alias for `experiment`. The schema returns `{ claim, quote, page }`. The stress-test now receives origins of "external source", "researcher's own experiment" or "researcher's own draft".
- **Anki** is gone from the app and README. `landing.html` still mentions it until its Part 10 rewrite.
- **Claim style revised (2026-10-06, user feedback):** claims are now general scientific statements: subject, effect, conditions and numbers, present tense, hedging kept, with no "the study shows" or "the repeat run". A claim may combine several passages about one idea, and each card keeps the single quote that best supports it (the user chose this over several quotes or no quote). The shared rules in `cardRules` (`server/prompts.js`) include good/bad examples from an unrelated field (batteries) so the model doesn't copy the demo, plus a self-check. The experiment prompt turns an anomaly and its suspected cause into one causal claim. Expect fewer, stronger cards; Experiment 3 now gives 3–4 cards instead of 7.
- **Standalone-claim rule (2026-10-06, user feedback):** every claim must pass an "I claim that …" test, and another study must be able to support or contradict it. `cardRules` now lists what is never a card: what a study did, measured, or didn't test ("dissolved oxygen was not measured"); study scope and limitations as such; advice on how to do research; and measurement precision. Limitations go inside the claim they limit, phrased about the world ("has not been confirmed"), not about the study. Checked on the demo: S1–S4, Experiment 3, and the draft no longer produce "was not measured / not tested" or lab-advice cards.
- **Quote check is now sentence-based:** every sentence of a quote (and each part around a "…") must appear word-for-word, in order, on one page. The server inserts " … " wherever the model skipped text. The browser's re-check (`quoteInPages`) uses the same rule.
- **Verified** with real AI calls: the demo's Haddad PDF (external, 8 cards), the Experiment 3 paste (experiment, 7 cards) and `draft-discussion.txt` (draft, 7 cards, e.g. "The draft argues that temperature is the dominant factor…") each produced claim cards with the right badge. Old flashcards showed migrated, and no "Anki" text remains in the app.

---

## Part 4 — Project shell: tabs + "Add evidence" anywhere ✅ Done 2026-10-06
**Goal:** the new layout, with the web tab as an empty placeholder.
- `index.html` / new `src/project-shell.js`: the project header (name, colour, settings) plus tabs **Web · Cards · Sources · Question & history · Insights**. Retire the stepper.
- "**+ Add evidence**" opens a drawer (link / upload / paste + origin choice) from any tab, using the `ingest.js` code.
- Cards tab = today's review list (grouped by source, filter by origin). Sources tab = the project's sources with remove. Insights tab = today's Judgment content from `src/judgment.js` (temporarily).
- Opening a project lands on Web (empty state: "Add evidence to start your web").

**Done when:** everything previously reachable is still reachable; adding evidence works from every tab; the URL hash remembers the tab.

*As built:*
- `src/project-shell.js` has `showTab`, `renderTabs` (the small status line under each tab, and the Web placeholder text), and `openDrawer`/`closeDrawer`. The tab bar reuses the old stepper's styles. The **right-hand rail is gone**: the question, hypothesis, and the research trail (now the full list of up to 30 entries, not the last 5) live in the **Question & history** tab. Part 5 adds the version timeline there.
- **+ Add evidence** sits in the project header and in the Web empty state, so it's reachable from every tab. The drawer is a right-hand panel at the page level (outside `#workspace`, so it covers the whole window). It closes on ×, Escape, a click on the backdrop, or when extraction finishes; it stays open if a link can't be read so you can try again. After adding evidence you stay on the tab you were on.
- **Hash:** `#workspace/<tab>` (for example `#workspace/cards`); other views keep `#library`, `#projects`, and so on. A plain `#workspace` opens Web.
- **Where things land:** opening a project (Projects page, sidebar, after setup) goes to Web. Library's "Open project" goes to Sources. Insights' next-step suggestions go to Question & history, Cards, or open the drawer.
- **Web placeholder:** with no cards it says "Add evidence to start your web"; once there are cards it says how many ideas there are and links to the Cards tab. Part 7 replaces this panel.
- `src/judgment.js` keeps its name until Part 9 and now renders the Insights tab.
- **Verified** with a scripted Chrome run (Puppeteer, real AI calls): new project → lands on `#workspace/web`; every tab shows its panel and sets the hash; a reload keeps the tab; evidence added from the Web, Cards, Sources, Question & history, and Insights tabs (PDF, paste, arXiv link, DOI link, PDF, draft); origin filter; settings, Library, Saved evidence, Markdown export, and Escape all work. The only console error was the known `favicon.ico` 404.

---

## Part 4B — Source metadata ✅ Done 2026-10-06
**Goal:** know *what* each source is (authors, year, venue), not just its file name.
- **Model:** `source.meta = { title, authors[], year, venue, doi, url }`, all optional and editable.
- **Where it comes from**, cheapest first:
  - `citation_*` meta tags already on arXiv and publisher pages (title, authors, date, journal, DOI), read in `server/routes/fetch-source.js`;
  - PDF document info (Title/Author/CreationDate) for uploads and fetched PDFs;
  - a **Crossref** lookup by DOI (new `POST /api/lookup-doi`; sends only the DOI) when a DOI is known but fields are missing;
  - as a last resort, the extraction call also returns any title, author, or year printed in the first page's text (extra optional fields in the extraction schema).
- **UI:** Sources tab and Library show "Authors (year) · Venue"; an **Edit details** form fixes anything wrong; cards show a short citation ("Okafor & Lindqvist 2019"). Markdown export lists sources as simple references.
- Own work and drafts get no metadata, just their label and date.

**Done when:** an arXiv link shows authors and year; a DOI shows its journal; an uploaded PDF with document info shows its title and author; manually edited details persist; the demo project's fake PDFs show the authors printed on their first page.

*As built:*
- **Layers, highest priority first:** for links, the landing page's meta tags (`citation_title`, every `citation_author`, `citation_publication_date`/`citation_date`, `citation_journal_title`/`citation_conference_title`/`citation_publisher`, `citation_doi`, with Dublin Core as backup; arXiv pages get venue "arXiv"), then the PDF's document info, then Crossref, then the extraction model's `source_info`. For uploaded PDFs: document info, then `source_info`. For pasted text and `.md`/`.txt` files: `source_info` only. Each layer only fills fields the earlier ones left empty (`mergeMeta`). Placeholder PDF titles ("Untitled", "Microsoft Word - …") are ignored.
- **Crossref** runs inside `/api/fetch-source` when a DOI is known (from the page or a `doi.org` link) and authors, date, or venue are missing; failures are ignored. `POST /api/lookup-doi` (`server/routes/lookup-doi.js`) is used by the **Fill from DOI** button in the Edit details form. Only the DOI is sent.
- **Extraction schema** gained a required `source_info { title, authors[], year, venue, doi }`, filled only from what is printed in the material (empty otherwise). The browser uses it only for external sources.
- **Line breaks are now kept** in source text sent for extraction (`capPages` in the browser and server collapse spaces but keep single newlines, and the browser's PDF reader emits pdf.js's line ends). Without them, the demo PDFs' author line ran into the journal line and the model read "Erik Lindqvist Demo" as a name. Quote checks ignore whitespace, so verification is unchanged.
- **Display:** the Sources tab and Library show "Authors (year) · Venue" (more than three authors → "et al."); cards show a short citation next to the origin badge ("Okafor & Lindqvist 2019", "Vaswani et al. 2017"); Markdown export lists external sources as "Authors (year). Title. Venue. https://doi.org/…". Own work shows "My experiment · added 6 Oct 2026" (sources now get `addedAt`; older ones just show the label).
- The pure helpers (`cleanMeta`, `mergeMeta`, `pdfInfoMeta`, `shortCitation`, `citationLine`, `reference`) are in `src/records.js` and tested in `test/source-meta.test.js`, along with the meta-tag reader, Crossref mapping, the lookup route (with `fetch` stubbed), and `source_info` cleaning. 67 tests in total.
- **Verified** in Chrome with real calls: arXiv 1706.03762 → "Ashish Vaswani, Noam Shazeer, Niki Parmar et al. (2017) · arXiv"; DOI 10.1038/nature14539 → "… (2015) · Nature"; a PDF with document info → "Cold storage and ascorbic acid", "Priya Raman, Tomas Berg (2020)"; demo S1 → "Chidinma Okafor, Erik Lindqvist (2019) · Demo Journal of Food Chemistry" (S2, S3, and S4 also correct when checked through the API); an edited venue survived a reload; the draft showed only "My draft · added …".

---

## Part 5 — Hypothesis versions (C3) + hypothesis ideas ✅ Done 2026-10-06
**Goal:** a recorded history of the question and hypothesis, and hypothesis guesses as ideas.
- **Question & history tab** (`src/history.js`): edit the question and hypothesis; **Record this version** saves `{ question, hypothesis, note, linkedCardIds, createdAt }`; a timeline shows each version with what changed (simple word diff), the note, and linked cards. Setup step 2 records version 1.
- **Splitting:** new route `POST /api/split-hypothesis` + prompt that splits the hypothesis into 1–5 separate, testable guesses. Each becomes a card with `origin: "hypothesis"`, tied to its version. Recording a new version marks the old guesses *superseded* (kept for history, hidden from the web by default).
- Activity trail logs version changes.

**Done when:** recording two versions shows both in the timeline with notes and diffs; the hypothesis guesses appear in the Cards tab with the hypothesis badge; old guesses are marked superseded.

*As built:*
- **Storage:** versions live on the project as `project.versions[]` (`{ id, number, question, hypothesis, note, linkedCardIds, createdAt }`), saved with the project record like `activities`. Backup, restore, and delete need no changes. The empty `versions` IndexedDB store from Part 2 is still unused.
- **Recording** (`src/history.js`): the Question & history tab keeps free editing. Below it are an optional "What changed, and why?" note, a collapsible checklist of non-rejected evidence cards to link (saved cards first), and **Record this version**. It refuses to record when nothing changed since the last version. A status line says "Matches version N" or "Edited since version N", and the tab shows "Version N · edited".
- **Guesses:** only when the hypothesis text changed (or for version 1) are the old guesses marked `superseded` and the new hypothesis split. A question-only change keeps the current guesses. Each guess is a card `{ origin: "hypothesis", sourceId: "", location: "Hypothesis vN", versionId, superseded? }`, whose quote is the part of the hypothesis it came from (the server replaces a quote it can't find with the whole hypothesis). Without AI, each sentence becomes one guess.
- **`POST /api/split-hypothesis`** (`server/routes/hypothesis.js`, `splitHypothesisPrompt`): 1–5 guesses, each a standalone "I claim that …" statement in the same style as card claims, keeping the researcher's wording, numbers, and hedges. A conclusion ("so refrigeration is best") is its own guess.
- **Timeline:** newest first. Each version shows its note, the question and hypothesis as a word diff against the version before (green insertions, red strike-through deletions, "Unchanged" when equal), its guesses (tagged *superseded* when replaced), and its linked evidence.
- **Cards tab:** "My hypothesis: current guesses" comes first, and "Earlier hypothesis guesses (superseded)" comes last, faded with a tag. The origin filter has a "My hypothesis" option. Superseded guesses don't count as ideas on the Web tab. Hypothesis cards are left out of the Insights "evidence cards" count and the stress-test input (Part 9 decides how the stress-test uses them).
- **Setup** records version 1 ("Starting point, from project setup"). Its guesses are split in the background while your work is read. Existing projects get no automatic version 1; Insights suggests "Record your first version".
- **Activity trail** logs "Recorded version N of the question and hypothesis" with the note.
- **Tests:** `test/history.test.js` covers `wordDiff`, the sentence fallback, guess cleaning, and the route (72 tests in total).
- **Verified** in Chrome with real AI calls on the demo project. Setup produced version 1 with 4 guesses (for example "The rate of vitamin C loss in stored orange juice roughly doubles for every 10 °C rise in storage temperature."). Recording with no changes was refused. A new hypothesis with a note and 2 linked Haddad cards gave version 2, shown with its note, diff, and linked evidence; the 4 old guesses were marked superseded and 3–4 new ones were added. A question-only change gave version 3 and kept the guesses. The Web count left out superseded guesses, everything persisted after a reload, and there were no console errors.

---

## Part 6 — Relationship pipeline (automatic, efficient) ✅ Done 2026-10-07
**Goal:** the AI decides how ideas relate, in the background, without a button. There is no graph yet; relations show as chips on cards so they can be checked.
- **Server:** `POST /api/embed` (batch of texts → `text-embedding-3-small` vectors) and `POST /api/relate` (batch of candidate pairs → for each, `{ relation: supports | contradicts | refines | same | explains | none, direction, confidence, rationale }` under a strict schema). New `relationPrompt` in `prompts.js`: judge only from the two texts, treat experiment/draft/hypothesis items as claims rather than facts, prefer `none` when unsure.
- **Client `src/pipeline.js`:** a persisted queue that runs automatically after new cards, new hypothesis guesses, or an edited claim (debounced).
  1. Embed only nodes without a cached embedding.
  2. For each new node, take the top ~8 most similar nodes in the project (cosine, in the browser) above a similarity floor.
  3. Skip pairs already judged (unless one side changed).
  4. Send the remaining pairs in batches of ~20 per `relate` call.
  5. Store edges with relation, direction, confidence, and rationale; drop `none`.
- **Efficiency targets:** about 1 embed call + 1–2 relate calls per imported source; nothing re-runs on reload; editing one card re-checks only that card's pairs.
- A status chip in the project header ("Connecting ideas… 12 left" / "Up to date" / "Paused: AI not configured"). Rejected cards are excluded.
- Cards tab: each card lists its relations ("Contradicts · Experiment: LSTM batch-size run").
- Update the setup privacy notice: card text is also sent to find relationships.

**Done when:** importing a paper and an experiment that disagree produces a `contradicts` edge with a sensible rationale; matching claims produce `supports` or `same`; reloading the page makes no new API calls (check the server log); editing one claim re-relates only that card; without a key the pipeline shows "Paused" and resumes once a key is set.

*As built:*
- **Server** (`server/routes/relations.js`): `POST /api/embed` (up to 100 texts, `text-embedding-3-small` at **512 dimensions** to keep stored vectors small) and `POST /api/relate` (up to 25 pairs). `relationPrompt` defines each relation and its direction, and says to report only "a relation a researcher would want drawn on a map of their evidence". It also says merely "consistent with" is not support, different numbers from clearly different conditions are not a contradiction, and anything below 0.6 confidence should be none. The server repairs malformed answers (a missing result becomes none; a symmetric relation gets direction none).
- **Client** (`src/pipeline.js`, pure helpers in `src/relations.js`): runs 1.5 s after any change (it is scheduled from `renderTabs`, so nearly every edit triggers a cheap check). An embedding is reused while the claim's wording is unchanged. Candidates are each idea's **8 most similar ideas (cosine ≥ 0.3) from a different source**. Claims from the same source, or guesses from the same hypothesis version, are never paired: the answer key is all cross-source, and this cut noise and cost. A pair is re-judged only when either claim's wording changed. Relate calls go 20 pairs at a time, **3 calls in parallel**. Every verdict is stored, "none" included, so it is never asked again. Edges under 0.6 confidence are stored but not shown. Embeddings and edges of deleted cards are removed; deleting a project removes its records; restore and delete reset the cache.
- **Status chip** in the project header: "Reading ideas… N left" / "Connecting ideas… N pairs left" / "Ideas up to date" / "Paused: AI not configured" / "Paused: couldn't reach the AI". Clicking it retries.
- **Cards tab:** each card lists up to 6 relations ("Contradicts · My experiment: …"), strongest first; hovering a line shows the rationale.
- Rejected cards and superseded hypothesis guesses take no part.
- **Privacy:** the setup notice, acknowledgement, and Privacy page now say each card's claim is sent to find relationships.
- **Verified** in Chrome on the full demo project (lab notebook + Experiment 3 at setup, S1–S5, the draft; 54 ideas). All checks passed:
  - **Relations found:** with the final prompt there were 180 relations (55 supports, 54 contradicts, 42 refines, 11 same, 18 explains). The first prompt gave 246, many of them weak "consistent with" links. Answer-key examples found: the draft's "temperature is dominant" ✕ Experiment 2's oxygen finding; hypothesis "refrigeration is best" ✕ Haddad; hypothesis "Q10 ≈ 2" ✕ Haddad's Q10 ≈ 1.4; Okafor's first-order kinetics ✕ Sato's two phases; Sato's fast phase *explains* Experiment 1's day-1 drop; Experiment 1's Q10 is the *same claim* as Okafor's; the copper explanation is the *same claim* in Experiment 3 and the draft and is *supported by* Ivanova; the draft's DCPIP claim ✕ the lab notebook's end-point trouble.
  - **Cost:** re-judging all 319 candidate pairs took 16 relate calls in 3.4 minutes.
  - **Caching and edits:** a reload made **0** embed/relate calls. Editing one claim embedded only that claim and re-judged only its 8 pairs.
  - **No key:** with no key the chip showed "Paused: AI not configured"; after restarting the server with a key, it finished on its own.

---

## Part 7 — The idea web ✅ Done 2026-10-07
**Goal:** the main view.
- `npm install d3-force d3-drag d3-zoom d3-selection`; new `src/web/` (`web-view.js`, `layout.js`, `render.js`, `legend.js`). The web replaces the placeholder in the Web tab (`[data-panel="web"]`, whose text is set by `renderTabs` in `src/project-shell.js`).
- **Nodes:** one per non-rejected card plus the current hypothesis guesses. Colour and shape by origin, for example: external = blue circle · experiment = green square · draft = amber rounded rectangle · hypothesis = accent-coloured diamond, larger. Label = shortened claim; saved cards get a ring.
- **Edges:** style per relation (for example supports = solid green, contradicts = red dashed, refines = grey arrow, same = double purple line, explains = orange arrow); thickness by confidence.
- **Physics:** `d3-force` with link distance and strength per relation (supports and same pull closer; contradicts at medium distance so the conflict stays visible), collision, and gentle centring. Hypothesis nodes are heavier anchors.
- **Interaction:** pan/zoom; drag a node (it stays pinned where dropped, double-click to unpin); hover highlights neighbours; click opens a **side panel** with the claim, quote, source, and a list of relations with rationales. Positions are saved per project.
- **Legend + filters:** toggle origins and relation types; search box to find a node.
- The web updates live as the pipeline adds edges (no full re-layout; new nodes appear near their neighbours).

**Done when:** a project with about 30 cards from mixed origins renders a readable web; drag/pin survives a reload; filters and search work; new evidence appears in the web without a refresh; it stays smooth at ~300 nodes.

*As built:*
- **d3:** the full `d3` v7 package's UMD build, loaded with a plain `<script>` from `node_modules/d3/dist/d3.min.js`, instead of `d3-force`/`d3-drag`/`d3-zoom`/`d3-selection`. Those packages import each other by bare name, which a browser can't resolve without a build step or an import map. It is one file in **`src/web/web-view.js`**, not four; the relation styles live in `src/relations.js`.
- **Nodes and edges:**
  - Nodes match the plan: circle, square, rounded box, and a larger diamond for hypothesis guesses. Saved cards have a dark outline, and pinned ideas a dashed one.
  - Supports also has an arrow (it is directional), alongside refines and explains. Contradicts is red dashed, and "same" is a purple double line.
  - Line width grows with confidence, and lines stop at the node's edge so arrowheads show.
- **Physics:** link distance and strength per relation. Same and supports pull closest; contradicts sits at about 200 units so the conflict stays visible. The first layout of the demo was cramped, so repulsion went up (−280, and −700 for hypothesis guesses, which are also pulled harder to the centre).
- **Labels:** to keep 50+ ideas readable, labels show only for hypothesis guesses, the hovered or selected idea and its neighbours, search matches, and everything once zoomed in past 1.3×. They stay the same size on screen at any zoom.
- **Interaction:**
  - Pan and zoom; **Fit to view** (it also fits once the first layout settles).
  - Drag pins an idea where it's dropped; double-click unpins it.
  - Hover dims everything except the idea's neighbours.
  - Click opens a side panel inside the canvas with the claim, quote, location and source, and every relation with its rationale and confidence. Clicking a relation jumps to that idea.
- **Positions** are saved as `project.webLayout` when the layout settles and after a drag. They don't count as "worked on" for the Projects page.
- **Legend chips** show counts and toggle each origin and relation type (filtered items are hidden but keep their place). **Search** highlights matches, and Enter jumps to the first.
- **Live updates:** new ideas start next to the ideas they relate to (or their source's other ideas) and the physics restarts gently. Changes in rationale or confidence alone don't restart it.
- The project header now wraps, so a long title isn't cut off by the extra status chip.
- **Verified** in Chrome on the demo (54 ideas, 180 relations):
  - One node per idea and one line per relation.
  - Clicking a contradicted idea showed its relations.
  - A dragged idea kept its exact position and pin after a reload.
  - The origin and relation filters hid the right items; searching "copper" highlighted 6 ideas, and Enter opened one.
  - Pasting a new experiment on the Web tab added its ideas without a refresh (54 → 56).
  - **300-idea test:** 304 synthetic ideas and 302 relations injected into the stores (no AI) rendered and ran at ~200 animation frames per second while settling. That figure comes from headless Chrome, so treat it as a rough smoothness check, not a real frame rate.
  - No console errors.

---

## Part 8 — Annotations
**Goal:** your own marks on the web.
- **Notes on ideas:** add or edit a note in the node side panel; a small note icon on annotated nodes; notes also show in the Cards tab.
- **Sticky notes:** double-click empty canvas (or a toolbar button) to create; drag, edit, colour, delete. They take part in pan/zoom but not in the physics. Stored in `annotations`.

**Done when:** notes and stickies persist across reloads, export in the Markdown/backup, and don't disturb the layout.

---

## Part 9 — Insights: the old Judgment, split
**Goal:** keep the judgment features where they make sense.
- **Web side panel → "Needs attention"** (`src/web/attention.js`): open contradictions (click → zoom to the pair); hypothesis guesses with no supporting or contradicting evidence yet; draft claims with no supporting evidence (this is the draft check from C4). Each item links into the web.
- **Insights tab** (`src/insights.js`, replacing `src/judgment.js`): counts by origin and by relation type; rule-based suggestions rewritten around the web (for example "3 hypothesis guesses have no evidence"); the **AI stress-test**, updated to receive hypothesis guesses and the strongest edges as well as cards, still behind its one-time consent checkbox.

**Done when:** a seeded project shows its contradiction and its unsupported draft claim in "Needs attention", clicking them focuses the web, and the stress-test runs with the new inputs.

---

## Part 10 — Smaller leftovers (any order, each independently testable)
- **Activity trail (O5):** keep the full history in IndexedDB; "Show all" view; log claim edits and version changes.
- **Per-project export (O6):** JSON export/import of a single project (cards, sources, edges, annotations, versions); Markdown export gains relations and versions.
- **Extension:** configurable port (from a manifest option or by detecting the tab); store `pendingCapture` in `chrome.storage.session`; delete the unused `lattice-bridge.js`; captures can be tagged with an origin.
- **Extraction UX:** a visible queue for imports, a cancel button, and not blocking setup while work is processed (let the user enter the project while cards stream in).
- **Mobile navigation:** a compact menu for screens under 850 px.
- **Landing page (after Part 7):** rewrite `landing.html` around the idea web and origin colours; remove the stance-label and Anki claims it still makes; add a screenshot of the web.
- **Placeholders:** remove the hard-coded "Logan D." user and the dead `•••` buttons (or give them real menus).

---

## Out of scope for this plan
Cross-project links in the web; drawing or editing connections by hand; OCR for scanned PDFs; `.docx` import; accounts/sync; replacing link scraping with arXiv/Crossref/OpenAlex APIs for *full text* (Part 4B uses Crossref for metadata only); stricter per-record validation when restoring a backup; Firefox/Safari versions of the capture extension. Known limitations kept for later are recorded in [FUTURE_WORK.md](FUTURE_WORK.md).

## Rough cost note
Per imported source: ~1 extraction call (as today) + ~1 embedding call (fractions of a cent) + ~1–2 relation calls with ~20 short pairs each. A typical project of a few hundred cards should cost cents, not dollars, in total, because pairs are judged once and cached.
