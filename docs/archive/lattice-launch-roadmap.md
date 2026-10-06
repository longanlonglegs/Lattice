# Lattice: from prototype to market launch

## The product thesis

Lattice is not a literature-search engine. It is a **local-first research thinking system**: it remembers what a person read, their hypotheses, their open questions, and the evidence for or against their ideas.

The lasting loop is:

```text
Research question → capture evidence → make a claim → test its support
→ reveal contradictions / open questions → choose the next action → retain what matters
```

The current prototype proves only the last part: grounded cards with review before Anki export. The roadmap below adds the rest without prematurely building an Elicit competitor.

---

## Phase 0 — Validate the workflow (now)

**Goal:** Learn whether people find the “claim + evidence + next question” workflow useful before building ingestion infrastructure.

### Ship

- Current clickable web prototype.
- Manual text paste and the existing card-review flow.
- A “Research question” field above source intake.
- Three manual claim states: `supports`, `contradicts`, and `open question`.
- A one-click local export of a session as Markdown.

### Code changes

```text
src/
  types.ts             # ResearchSession, Source, Claim, Card
  store.ts             # localStorage persistence
  claim-review.ts      # approve/reject/edit and evidence state
  markdown-export.ts   # session → portable .md
```

Keep the front end dependency-light. `localStorage` is enough at this point.

### Success gate

Run 5–10 research sessions with people who are actively working on a problem. Continue only if they return to an earlier session and say the claim/evidence view changed what they read or did next.

---

## Phase 1 — A usable local research workspace

**Goal:** Make it useful for one researcher’s real PDFs and notes, without sending their private corpus to the cloud by default.

### Ship

- Create, rename, and reopen research projects.
- Import PDF, Markdown, and plain-text files.
- Preserve page number, heading, and exact quoted passage for every claim.
- Add manual notes to a passage.
- Persist all projects and source metadata locally.
- Export approved flashcards to AnkiConnect and notes to Markdown.

### Architecture

Use a local desktop app: **Tauri + React + TypeScript + SQLite**. Tauri is a lighter, more privacy-friendly shell than Electron; SQLite avoids requiring a cloud database during the early product phase.

```text
apps/desktop/          # Tauri shell and React UI
packages/core/         # domain types and pure claim logic
packages/parser/       # PDF / text → page-aware SourceChunk objects
packages/exporters/    # AnkiConnect and Markdown
data/lattice.db        # SQLite; stays on the user’s device
```

### Critical data model

```ts
type Source = { id: string; title: string; kind: "pdf" | "web" | "note"; localPath?: string; url?: string };
type SourceChunk = { id: string; sourceId: string; text: string; page?: number; heading?: string };
type Claim = {
  id: string; projectId: string; statement: string;
  stance: "supports" | "contradicts" | "uncertain" | "question";
  evidence: Array<{ chunkId: string; exactQuote: string }>;
  userNote?: string;
};
```

Do not allow an AI-generated claim to be saved without `chunkId` and `exactQuote`.

### Success gate

One person can import a 20–40 page paper, create traceable claims, close the app, and resume the same project the following week with every passage still resolvable.

---

## Phase 2 — Browser capture and research memory

**Goal:** Differentiate Lattice from literature-review products by making the user’s actual research trail useful.

### Ship

- Chrome extension with **Save selection to Lattice**.
- Capture selected text, URL, title, author/date when available, and the user’s reason for saving it.
- Project-aware inbox: captured items wait to be triaged into a claim, question, or reference.
- A timeline: “what I read / believed / changed my mind about.”
- Local semantic search across a project’s sources and notes.

### Architecture

```text
apps/extension/        # Manifest V3 extension
apps/desktop/bridge/   # localhost authenticated bridge or native messaging
packages/search/       # embeddings + local vector index
```

Use a per-device pairing token between extension and desktop app. Never allow arbitrary web pages to write into a user’s project.

### Key UX

The extension should ask just one extra question after saving a selection:

> “Why might this matter?”

That tiny piece of user intent is what turns bookmarks into a personal research graph.

### Success gate

At least 40% of saved browser items are later turned into a claim, question, or project action. If they only accumulate in an inbox, improve capture/triage before adding more features.

---

## Phase 3 — Grounded AI, contradictions, and next actions

**Goal:** Give the user useful reasoning assistance without fabricating research conclusions.

### Ship

- Retrieval over a user-selected project, never the entire machine by default.
- Claim extraction that returns only statements anchored to exact source spans.
- Evidence grouping: support, contradiction, ambiguity, and missing evidence.
- “What changed?” view for a hypothesis over time.
- Next-action suggestions framed as structural gaps, for example:
  - “This central claim has no primary source.”
  - “Two sources use incompatible definitions of success.”
  - “Your draft says X; two saved passages support Y.”
- Research-question-aware card generation.

### AI contract

The model receives retrieved chunks and must return validated JSON:

```json
{
  "statement": "…",
  "stance": "uncertain",
  "evidence": [{"chunkId": "chunk_42", "quote": "verbatim text from chunk_42"}],
  "uncertainty": "The sources use different sample populations."
}
```

Server-side or local validation must verify every quote occurs in the referenced chunk. If not, discard it.

### Success gate

In a blinded review of 50 generated claims, 95% of quotes match their stored source and users judge at least 70% of next-action suggestions as useful.

---

## Phase 4 — Private beta and product hardening

**Goal:** Make the product safe and reliable enough for 50–150 real researchers.

### Ship

- Signed macOS installer; Windows build if demand justifies it.
- Opt-in encrypted sync and encrypted backup—local-only remains the default.
- Crash reporting with no source content or identifiers.
- A transparent privacy center: indexed folders, AI provider, stored data, and a “delete project” command.
- Onboarding using a sample project and a first-paper checklist.
- Error states for broken PDFs, failed Anki export, inaccessible web pages, and disconnected extension.
- Product analytics limited to consented, anonymized events.

### Operations

- Error tracking: Sentry or equivalent, configured to scrub source text and URLs.
- Support: in-app diagnostic bundle that requires explicit approval before export.
- Release channels: `dev`, `beta`, `stable`.
- Automated tests for import, quote anchoring, database migration, and Anki export.

### Success gate

Target 30% four-week retention among invitees who imported at least three sources. If retention is weak, interview churned users before building collaboration or broad discovery.

---

## Phase 5 — Paid launch

**Goal:** Launch a defensible product around the personal-research-memory moat.

### Positioning

> **Lattice is the private workspace that turns your reading into a living map of evidence, uncertainty, and next steps.**

Avoid “AI literature review” in the headline. That invites a direct comparison with Elicit. Lead with browser + notes + local files + thinking continuity.

### Product tiers

| Tier | Offer |
|---|---|
| Free | Local projects, manual claims, limited PDF import, Markdown export |
| Pro | Browser capture, local semantic search, grounded AI, Anki/Obsidian integrations |
| Team, later | Shared project spaces with explicit source-level permissions—not an early priority |

### Launch prerequisites

- A clean landing page with a short research-session demo.
- 8–12 design-partner testimonials or case studies.
- Pricing that clearly separates local productivity from paid AI usage.
- Privacy policy, terms, deletion flow, and support contact.
- A repeatable onboarding path: source → claim → question → next action in under 10 minutes.

### Launch metrics

- Activation: imported source + created one claim + saved one next action.
- Weekly value: return to a project, not just start a new one.
- Trust: claim edits/rejections and quote-verification success rate.
- Retention: active research projects after 4 and 8 weeks.

---

## Explicit non-goals until after launch

- A general-purpose web crawler.
- Claiming to identify truly unexplored research territory.
- Rebuilding a full reference manager, note editor, or spaced-repetition scheduler.
- Broad team collaboration before solo researchers have repeatable value.
- Cloud indexing of an entire drive by default.

## The build order in one line

**Personal capture → traceable claims → research memory → grounded reasoning → private beta → paid launch.**

Each phase is independently useful, reduces risk, and reinforces the thing Elicit cannot easily copy: the user’s long-lived private context and evolving reasoning.
