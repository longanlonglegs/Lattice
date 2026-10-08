---
target: insights
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:C:\\Users\\shend\\Desktop\\Lattice\\src\\insights.js"
target_fingerprint: "sha256:8e5cdac2ce60bc0792356310982058019bf44bec4f8ae73b8a7a8c43bf9eafd5"
target_path: "C:\\Users\\shend\\Desktop\\Lattice\\src\\insights.js"
timestamp: 2026-10-08T03-21-29Z
slug: src-insights-js
---
Method: dual-agent (A: design review · B: detector + contrast). Both from source only: no browser automation available, no overlay.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Loading steps advance on a 6s timer, not real progress; a saved AI read is silently wiped by edits |
| 2 | Match System / Real World | 3 | Plain verdicts ("Holding up"), but vocabulary drifts: ideas/cards/evidence/connections/guesses/parts |
| 3 | User Control and Freedom | 2 | Every card jumps to the Web tab with no way back; the AI read can't be cancelled |
| 4 | Consistency and Standards | 2 | AI box is External-source blue; "Contested" and gaps use My-draft amber; part number shown twice |
| 5 | Error Prevention | 2 | Button enabled with no API key; any keystroke in title/question/hypothesis deletes the read |
| 6 | Recognition Rather Than Recall | 3 | Relation reasons only in hover title; no quotes on the page |
| 7 | Flexibility and Efficiency | 2 | No collapse/filter ("only contested"), no return path from the web |
| 8 | Aesthetic and Minimalist Design | 2 | An untested guess is reported up to 4 times; counts repeat in 4 places |
| 9 | Error Recovery | 2 | Errors only in a 4s toast; page re-renders as if nothing happened |
| 10 | Help and Documentation | 3 | Good setup checklist and empty states; verdict meaning only in tooltips |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
LLM: the per-part hub map (guess as dark hub, for-evidence left, against right, origin-coloured cards, relation-coloured lines; insights.js:151-161, 286-310) and the contradiction pair are authored for Lattice. Around them sits generic dashboard furniture: KPI stats strip (238-243), a light-blue gradient "AI feature" box (styles.css:565), task-tool priority pills, a uniform gap-card grid. Blue AI and amber Contested/gaps break DESIGN.md's Meaning-Only Colour Rule.
Deterministic: 175 findings on index.html (no line numbers; JS-rendered markup unscanned). Insights-relevant: numbered-section-labels ×3 (.ins-step), marquee loading bar (respects reduced motion; weak), undersized text, side-tab border accents on .ins-guess/.ins-card (meaningful, judgement call). Contrast: 32 of 64 Insights text rules below 4.5:1 (worst .ins-verdict[mixed] 2.57, .ins-stance-count 2.59, .ins-prose.muted 2.82). 19 Insights rules below 11px (four at 9px).

## Priority Issues
- [P0] Saved AI reads are deleted when the user types (main.js:77 clearAiAnalysis on every input incl. project title; also cards.js:102/122, workspace.js:69). Stale-read path in insights.js:381 is mostly dead. Fix: keep the read, rely on the signature check, say what changed. → harden
- [P1] Traceability stops at Insights: no quotes, rationale only in title tooltips (insights.js:119-120, 197), AI prose not tied to cards. Fix: inline expandable "why" with relation, rationale, first quote + location; AI prose cites card chips. → clarify
- [P1] Wrong-meaning colour: AI box/button blue collides with External source; Contested/gaps use My-draft amber; priority pills add another scheme. Fix: ink/paper AI box with mono "AI" tag; neutral or split-relation Contested. → quieter / colorize
- [P1] Repetition and everything open at once: counts/untested states repeated across overview prose, stats, stance rows, hub tally, side labels, gaps; all parts expanded. Fix: stance rows as the single overview, parts collapsed into rows that open the map, drop duplicates. → distill, then layout
- [P1] Legibility: 32/64 text rules fail AA, 19 rules under 11px, eight tiers of 9–10px mono labels. → typeset / audit
- [P2] Loading/errors/a11y: content hidden during up-to-a-minute load; timer inside aria-live announces every second (index.html:186); errors toast-only; no cancel; no :focus-visible on .ins-card/.ins-stance/.ins-link/.ins-chip; parts are <p> not headings. → harden

## Persona Red Flags
Jordan: unexplained "AI read / guess / part / adds conditions"; no line legend; consent text is the first thing seen; card click strands them in Web.
Sam: reasons only in title; live region chatter; no part headings; glyphs ▲▼◇✕ read aloud; no focus styles; low-contrast 9–10px text.
Priya (16, demoing to a judge): blank minute-long load; fixing a word wipes the read; "Holding up" can rest on one card of her own; "show me the source" means leaving the tab; "Under pressure" with no framing reads as failure.

## Minor Observations
sideOf ignores edge direction (insights.js:20); hub tally duplicates side labels; stance bar order (against-left) reverses map columns (for-left); AI and count gaps can duplicate; inputsForAi sends only 5 guesses but a 6th part shows "last AI read didn't cover this part" unexplained; "under a minute" promise has no timeout handling.

## Questions to Consider
1. Should Insights be the web filtered to one hypothesis part at a time rather than a separate scrolling report?
2. What if the page ended on one recommended next action instead of a grid of gaps?
3. Should a verdict ever appear without the quote that justifies it?
