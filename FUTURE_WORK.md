# Future work

Known limitations recorded for later. These are not part of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Every save rewrites the whole workspace
*Recorded 2026-10-06.*

Each change (even one keystroke in a card) rewrites every project, source, and card record in IndexedDB in one transaction. Full source texts are stored separately and are not rewritten, so this is cheap at current sizes (hundreds of cards). With thousands of cards, typing could start to feel slow. A possible fix later: write only the records that changed (dirty tracking) and debounce text-field saves.

## Quotes from older sources can't be re-checked
*Recorded 2026-10-06.*

Full source text is stored only for sources imported after Part 2. Cards from earlier sources never show the "quote not found in source" badge, because there's nothing to check against. A possible fix later: offer "re-import to enable quote checks" on those sources.

## Long sources are only partly read (60k-character cap)
*Recorded 2026-10-06.*

Card extraction sends only the **first ~60,000 characters** of a source to the AI (`MAX_SOURCE_CHARS` in `server/config.js`, `maxAiChars` in `src/ingest.js`), which is roughly 15–20 pages of a paper. Anything after that is never turned into cards. For long papers, theses, and reports, this usually means the discussion, limitations, and conclusions are missed. Fetched PDFs also stop being parsed once the cap is reached. The app tells the user when a source was cut short, but doesn't read the rest.

A possible fix later: split long sources into chunks (for example by page or section), extract from each chunk, and merge or deduplicate the cards.

## The local server serves every file in the project folder
*Recorded 2026-10-06. Confirmed by testing.*

The static file handler in `server/index.js` serves any file under the project root, not just the app's own files. For example `http://localhost:4173/.git/HEAD`, `/server/index.js`, and `/PROJECT_STATUS.md` all return 200. If an `.env` file holding the OpenAI key were ever added to the folder, it would be served too. The server only listens on `127.0.0.1`, which limits the risk, but other local programs or a DNS-rebinding attack could read these files.

A possible fix later: serve only an allow-list (`index.html`, `styles.css`, the app's scripts, `landing.*`, and the specific `node_modules` files the browser needs), and never serve dotfiles.

## Any website can trigger the local API
*Recorded 2026-10-06. Confirmed by testing.*

The `/api/*` routes accept a POST from any origin and parse the body as JSON whatever its `Content-Type`. A website open in the same browser can send a "simple" cross-site request (`Content-Type: text/plain`, no preflight) to `http://localhost:4173/api/...` while Lattice is running. It can't read the response, but the request still runs. That means it can spend the user's OpenAI credit through `/api/extract-cards` and `/api/evidence-analysis`, and make the server fetch arbitrary public URLs through `/api/fetch-source`. A test request with `Origin: https://evil.example` was processed.

A possible fix later: reject API requests whose `Content-Type` isn't `application/json` (which forces a CORS preflight the server never approves) and whose `Origin`/`Host` isn't the local app.

## Source details: gaps left on purpose
*Recorded 2026-10-06 (Part 4B).*

- **No automatic Crossref lookup for uploads or pastes.** Crossref runs automatically only for links. If the extraction model reads a DOI off an uploaded PDF, it is stored, but the other fields aren't looked up until the user clicks **Fill from DOI** in Edit details. A possible fix later: look up a newly found DOI after extraction when authors, year, or venue are missing.
- **Author names are split by simple rules.** A single author written "Smith, John" in one string (for example in PDF document info) is read as two names, because commas separate authors there. Lists from meta tags and Crossref are unaffected. Edit details fixes it by hand.
- **PDF document info is often junk.** Only a few placeholder titles ("Untitled", "Microsoft Word - …") are ignored; other auto-generated titles or authors (for example a word-processor user name) are kept until the user edits them.

## Explain why ideas disagree
*Recorded 2026-10-06. Feature idea, not a known limitation.*

The idea web (Parts 6–7) will show *that* two ideas contradict each other, but not *why*. Researchers often learn the most from that "why". For example, in the demo, Okafor finds temperature dominates while Haddad finds dissolved oxygen dominates. The likely reason is different conditions: sealed bottles measured over weeks versus air-saturated juice in the first 72 hours. Experiment 3's anomaly is likely explained by copper contamination (Ivanova).

**Idea:** for a `contradicts` edge (or one the user picks), the AI suggests possible reasons for the disagreement:
- **Different conditions or scope:** temperature range, time window, sample type, packaging.
- **Different methods:** measurement technique, model fitted (first-order vs biphasic), sampling schedule.
- **A hidden factor named elsewhere in the project:** for example copper, or oxygen.
- **Different definitions or units.**
- **Only one side being well supported:** for example a draft claim against several sources.

Each suggested reason should cite the cards and quotes it rests on, use only the project's own evidence (the same rule as the stress-test), and be labelled as a hypothesis to check, not a finding.

**Where it could live:** a "Why might these disagree?" button in the web's side panel for a contradiction, and in "Needs attention" (Part 9). Results are cached on the edge so they aren't regenerated. A suggested reason could optionally be saved as a note (Part 8), or turned into a new hypothesis guess (Part 5).

**Privacy and cost:** it sends the two claims, their quotes, and a few related cards to OpenAI. That's one short call, run only when the user asks for it.

## Hypothesis versions: simplifications
*Recorded 2026-10-06 (Part 5).*

- **Any change to the hypothesis replaces all its guesses.** Even fixing a typo marks every current guess superseded and splits the hypothesis again, so saves, rejections, and edits on those guesses don't carry over. A possible fix later: keep a guess whose wording is unchanged (or nearly unchanged) instead of replacing it.
- **Linked evidence can disappear from the timeline.** A version stores card IDs. If the card's source is removed later, the link silently drops out of the timeline. A possible fix later: store a copy of the claim in the version.
- **Projects created before Part 5 have no version 1** until the user records one. Insights suggests doing so.

## Relationship pipeline and idea web: limits
*Recorded 2026-10-07 (Parts 6 and 7).*

- **Ideas from the same source are never compared.** A paper's own claims (or a draft's) don't get relations between them, which keeps the web focused on cross-source connections. Some within-source links (for example a mechanism and the result it explains, both in one paper) are therefore missing.
- **Changing the relation prompt doesn't re-judge old pairs.** Verdicts are cached by the two claims' wording, so a better prompt only affects new or edited pairs. A possible fix later: store a prompt version on each edge and re-judge when it changes.
- **The web gets dense with a well-connected project.** The demo's 54 ideas have 180 relations. Hover-highlighting, filters, and search keep it usable, but a "show only the strongest N relations per idea" option or clustering by source may be needed for large projects.
- **Relating is slow-ish.** Each relate call (20 pairs) takes about 30–60 s with `gpt-5-mini`; three run at once. A first import of many sources keeps the chip busy for a few minutes.
- **Superseded hypothesis guesses are always hidden from the web.** The plan said "hidden by default"; there is no toggle to show them yet.
- **The 300-idea smoothness check ran in headless Chrome**, where frame timing isn't representative. Rendering is SVG; switch to canvas if real projects feel slow.
