# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who are new to research: students and members of the general public who have just stepped into a field and are trying to investigate a question in it. They read papers they only partly understand, and run their own experiments, often without a supervisor showing them how researchers keep track of evidence. Lattice's job is to raise the level of their research: to show them how their sources, their own results, and their own claims fit together, and where they don't.

They mostly work on a laptop or desktop; phones are secondary.

## Product Purpose

Lattice is a local-first research workspace. It turns papers, PDFs, pasted text, browser captures, and the user's own experiment notes into evidence cards, each one claim anchored to verbatim quotes that are checked word-for-word against the source. It then maps how every idea relates to the others and to the user's hypothesis in an idea web, and records how the hypothesis changes over time.

One-liner (from PROJECT_STATUS.md): identify, organise, and connect ideas to make research faster.

Success right now: Lattice is being prepared as a **competition / showcase** entry. It succeeds when a demo makes the mechanism obvious and convincing within minutes: a newcomer's scattered reading becomes a verifiable map of their thinking.

## Positioning

- **Grounded, not generated.** Every card rests on exact quotes that Lattice verifies against the stored source text; nothing is paraphrased into existence. A chatbot summary cannot make that promise.
- **Built around *your* hypothesis and *your* work.** Evidence is related to the user's own hypothesis guesses and experiments, not just to other papers. The AI draws the relationships (supports, contradicts, refines, same claim, explains) automatically.
- **Lattice remembers.** Hypothesis versions, the research trail, and every judged relationship persist, unlike a chat session.
- **Private by default.** No account and no cloud database; projects live in the browser's IndexedDB. Only the text needed for extraction and relationship-finding goes to OpenAI, and only when a key is configured.

Differentiation recorded in PROJECT_STATUS.md: versus ChatGPT, the idea web of AI-drawn relationships between your evidence, hypothesis history; versus Elicit, hypothesis history, relating evidence to your own hypothesis and experiments, and local-first privacy.

## Operating Context

The workflow: create a project (name, colour, research question, working hypothesis, any finished work, privacy acknowledgement) → add evidence by link, DOI, PDF, paste, or the Chrome extension, labelling each as **External source** or **My experiment** → review generated cards one at a time in the review deck (accept, reject, edit) → explore the **Web** tab → act on **Needs attention** (contradictions, untested guesses) → revise the hypothesis and **Record this version** → export Markdown.

Project tabs: Web (default), Cards, Sources, Question & history, Insights. Other views: Projects, Library, Privacy & data, How it works.

Sessions are long and reading-heavy; in a showcase setting they are short guided demos, usually run from the fictional demo project.

## Capabilities and Constraints

- Vanilla JS ES modules, no build step, no framework; d3 v7 for the idea web; pdfjs-dist for PDFs; a plain Node `http` server on `127.0.0.1:4173` proxying OpenAI (`gpt-5-mini`, `text-embedding-3-small`).
- Works without an AI key via rule-based "basic extraction"; the UI must label that state honestly.
- Origins are a core vocabulary, each with its own colour and shape: External source, My experiment, My hypothesis. ("My draft" was retired on 2026-10-08; old draft cards load as My experiment.) Relation types: supports, contradicts, refines, same claim, explains.
- Cards are not labelled as supporting or contradicting by hand (removed 2026-10-05); relationships come from the pipeline.
- Insights must not claim a research area is unexplored or infer facts beyond the saved project corpus.
- Only the first ~60,000 characters of a source are read; the app must say when a source was truncated.
- Known open issues are tracked in FUTURE_WORK.md.

## Brand Commitments

- Name: **Lattice**.
- Voice in existing copy: plain, specific, unhyped; explains what happens to the user's data. Examples: "Your unpublished work is not the product." "Build a map of your thinking, not another pile of summaries."
- Visual standard (chosen 2026-10-08, after two direction rounds): Lattice looks like the category standard executed at full craft, sitting alongside canvas-first tools such as Figma, Miro, and Obsidian's graph view. The web is a first-class canvas; conventions are embraced, not themed.
- Must not feel playful or childish. Must read well projected on a big screen.
- Privacy transparency is part of the identity: the How it works guide marks each step *on your device* or *sent to OpenAI*.

## Evidence on Hand

- Fictional demo project: [demo/vitamin-c/](demo/vitamin-c/) (sources S1–S5, lab notebook, experiment anomaly) with an answer key of built-in tensions. It is fictional and must be presented as such.
- Idea web screenshot: [docs/images/idea-web.png](docs/images/idea-web.png).
- Landing page copy: [landing.html](landing.html) (partly outdated: still advertises stance labels and Anki export).
- **No** real users, testimonials, usage numbers, institutional endorsements, or published results exist. Do not fabricate them.

## Product Principles

1. **Every claim traceable.** Anything Lattice shows should lead back to the exact words it came from.
2. **Teach by showing structure.** Newcomers learn research practice by seeing how evidence relates to a hypothesis, not by reading advice.
3. **The user's thinking is the centre.** The hypothesis and the user's own work anchor everything; sources orbit them.
4. **Honest about the machine.** Say when the AI is off, when a source was cut short, when a quote can't be found, and what leaves the device.
5. **Legible in a demo.** The core idea must be understandable to a judge or newcomer within minutes.

## Accessibility & Inclusion

Laptop-first. No product-specific requirements beyond sensible defaults. The audience is new to research, so jargon should be explained or avoided.
