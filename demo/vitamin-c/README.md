# Demo project: Vitamin C in stored orange juice (chemistry)

A small, **entirely fictional** research project for testing Lattice. Every paper, author, journal, and result here was made up for testing. None of it is real literature, so don't cite it.

The sources disagree with each other, and with the student's own experiments, in deliberate ways (see the [answer key](#answer-key-the-built-in-tensions)), so the extraction, connection, and judgment features all have something to find.

---

## 1. Project setup (the "New project" screen)

| Field | Enter |
|---|---|
| **Project name** | `Vitamin C loss in stored orange juice` |
| **Colour** | Orange (amber) |
| **Research question** | `How do storage temperature and exposure to air affect the rate at which vitamin C is lost from orange juice?` |
| **Working hypothesis** | `Vitamin C loss follows first-order kinetics, and its rate roughly doubles for every 10 °C rise in storage temperature. Temperature matters more than exposure to air, so refrigeration is the best way to preserve vitamin C.` |

**Your work so far** (step 3):
- **Upload PDF:** `your-work/lab-notebook-experiments-1-2.pdf` (Experiments 1 and 2).
- **Paste text:** the contents of `your-work/experiment-3-anomaly-PASTE.txt`, with the label `Experiment 3 – repeat run anomaly`.

Then tick the privacy acknowledgement and create the project.

## 2. Add the evidence (+ Add evidence, from any project tab)

| File | How to add | Origin |
|---|---|---|
| `sources/S1-okafor-2019-arrhenius.pdf` | Upload file | External |
| `sources/S2-haddad-2021-oxygen.pdf` | Upload file | External |
| `sources/S3-sato-2020-biphasic.pdf` | Upload file | External |
| `sources/S4-ivanova-2018-copper.md` | Upload file (tests `.md`) | External |
| `sources/S5-dcpip-method-note-PASTE.txt` | Paste text | External |
| `https://en.wikipedia.org/wiki/Vitamin_C` | Link tab (a real page, to test link fetching) | External |

**Browser capture:** with the extension loaded, select a paragraph about oxidation or stability on the Wikipedia page above and use *Save selection to Lattice*.

That gives 2 pieces of your own work, 5 fictional sources, and 1 real web page. Expect roughly 40–60 cards.

## 3. What each file contains

| File | Says | Role in the demo |
|---|---|---|
| **S1** Okafor & Lindqvist 2019 | Sealed bottles: loss is first-order, Ea 52 kJ/mol, Q10 ≈ 2; temperature is the main controllable factor; fridge cuts loss by ~⅔. | **Supports** the hypothesis. |
| **S2** Haddad et al. 2021 | Dissolved oxygen drives early loss (18% vs 3% in 72 h); weak temperature effect when oxygen is limited (Q10 ≈ 1.4); oxygen-barrier packaging matters. | **Contradicts** "temperature matters more than air". |
| **S3** Sato & Brennan 2020 | Loss is **biphasic** (fast while O₂ lasts, then slow); single first-order fits mislead, especially when the first sample is taken after day 1. | **Contradicts** "first-order kinetics"; **refines** S1 (S1 first sampled at day 1). |
| **S4** Ivanova 2018 | 0.5 mg/L copper speeds loss 3–5×, more than raising temperature from 4 to 20 °C; tap water from copper pipes is a common cause. | **Explains** the Experiment 3 anomaly. |
| **S5** DCPIP method note | DCPIP end points are hard to see in orange juice; overestimates vitamin C, so losses look smaller than they are. | **Undermines** the student's measurement method (Experiments 1–3 used DCPIP). |
| **Lab notebook** (Exp. 1–2) | Exp 1: 4/20/40 °C lose 9/24/51% in 7 days; bigger day-1 drop. Exp 2: open beakers lose 41% vs 15% sealed full bottles. | Exp 1 **supports** the temperature part; Exp 2 **contradicts** "temperature matters more"; the day-1 drop **agrees with** S3. |
| **Experiment 3** | Repeat run lost 38% (vs 24%); bottles rinsed with copper-pipe tap water; redo gave 22%. | **Explained by** S4; copper never measured, so unconfirmed. |

## Answer key: the built-in tensions

Use this to judge whether Lattice is finding the right things. It's the target for the AI stress-test today, and for the relationship pipeline and idea web (Parts 6–9 of [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)).

**Hypothesis guesses** (the hypothesis should split into roughly these):
1. H1 — Loss follows first-order kinetics. → **S1 supports**; **S3 contradicts**; Exp 1's day-1 drop **contradicts** (mildly).
2. H2 — Rate roughly doubles per 10 °C. → **S1 supports** (Q10 ≈ 2); **Exp 1 supports**; **S2 contradicts** when oxygen is limited (Q10 ≈ 1.4).
3. H3 — Temperature matters more than exposure to air. → **S2 contradicts**; **Exp 2 contradicts**; **S1 supports** (but only tested sealed bottles).
4. H4 — Refrigeration is the best way to preserve vitamin C. → **S1 supports**; **S2 contradicts** (oxygen barrier as important).

**Same claim / supports across origins:**
- S1 "fridge cuts loss by about two-thirds" ≈ Exp 1 "4 °C reduced loss by about two-thirds".
- S3 "fast early phase" ≈ Exp 1 "bigger first-day drop" ≈ S2 "most loss in the first 24 h".

**Explains / refines:**
- S4 copper catalysis **explains** Exp 3's anomaly.
- S2 "oxygen consumed within ~30 h" **explains** S3's biphasic curve.
- S3 "studies that first sample after day 1 miss the fast phase" **refines** S1's first-order conclusion.
- S2 "sealed studies hide the oxygen effect" **refines** S1 and Exp 1.


## Regenerating the PDFs

The PDFs are built from the text in `content/`. After editing those files, run:

```bash
node demo/vitamin-c/build-pdfs.cjs
```
