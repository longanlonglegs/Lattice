---
target: onboarding
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\shend\\Desktop\\Lattice\\src\\onboarding.js"
target_fingerprint: "sha256:e675f8a8436dfe701b2163c6a9cfc4b335e319f4e9af3cf20fa7e436b66d1f3b"
target_path: "C:\\Users\\shend\\Desktop\\Lattice\\src\\onboarding.js"
timestamp: 2026-10-08T04-08-09Z
slug: src-onboarding-js
---
Method: dual-agent (A: design review, source · B: detector + headless Chrome CDP run).
Score 24/40 (Acceptable). H1 3, H2 2, H3 2, H4 3, H5 2, H6 3, H7 1, H8 3, H9 3, H10 2.
Specificity: Lattice type/surfaces and warm copy, but a stock 4-step SaaS stepper; nothing previews the web.
Priority:
- [P1] Flat ending: Create -> toast + empty/loading web; hypothesis not shown. -> onboard, delight
- [P1] Focus/a11y: focus lost step3->4 (#ob-next hidden while focused), step change not announced, no aria-current, 8 swatch tab stops (no roving), Create disabled with no reason (error unreachable), active step number 3.73:1, upload label not focusable. -> harden
- [P2] Step 3 overloaded + jargon (hypothesis, inferences, evidence cards, experiment vs draft select defaulting to experiment). -> distill, clarify
- [P2] Privacy step reads like T&Cs (5 bullets, 30-word checkbox). -> clarify, quieter
- [P3] Cancel loses input silently; nothing teaches what a hypothesis is; Enter suppressed; no demo path. -> onboard
Detector: 36 CLI findings; onboarding-relevant: 11px mono labels w/ 1px tracking, 3.73:1 active step; ornament low-contrast = false positive. No mobile overflow; no JS errors.
