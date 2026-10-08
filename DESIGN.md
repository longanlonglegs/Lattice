---
name: Lattice
description: A canvas-first research workspace where evidence cards gather around your hypothesis on an infinite canvas.
colors:
  ink: "#1e1e1e"
  ink-soft: "#2c2c2c"
  ink-body: "#444444"
  muted-strong: "#595959"
  muted: "#6b6b6b"
  ornament: "#b3b3b3"
  card: "#ffffff"
  field: "#ffffff"
  raised: "#fafafa"
  paper: "#f5f5f5"
  sidebar-paper: "#ffffff"
  sunken: "#f0f0f0"
  selected: "#e5f4ff"
  track: "#e6e6e6"
  cream: "#fff4d6"
  line-soft: "#f0f0f0"
  line: "#e6e6e6"
  line-strong: "#d9d9d9"
  line-bold: "#b3b3b3"
  hub-ink: "#262626"
  hub-ink-deep: "#1a1a1a"
  on-dark: "#ffffff"
  on-dark-accent: "#ff9ccb"
  on-dark-for: "#6fdc9a"
  on-dark-against: "#ff8f78"
  on-dark-note: "#ffd166"
  accent: "#0c8ce9"
  accent-strong: "#0768c4"
  on-accent: "#ffffff"
  accent-soft: "#9ccfff"
  accent-ember: "#0768c4"
  accent-rust: "#055aab"
  accent-line-strong: "#66b8f5"
  accent-line: "#b8dcfa"
  accent-wash: "#dcefff"
  accent-tint: "#f2f9ff"
  origin-external: "#6e56cf"
  origin-experiment: "#14ae5c"
  origin-hypothesis: "#e03e8c"
  external-line: "#d5cdf5"
  external-tint: "#f3f0fd"
  notice: "#f08c00"
  notice-text: "#9a5b00"
  notice-line: "#f7d6a6"
  notice-tint: "#fff6e8"
  relation-supports: "#14ae5c"
  relation-contradicts: "#f24822"
  relation-refines: "#8f8f8f"
  relation-same: "#9747ff"
  relation-explains: "#0f9fa8"
  for-text: "#0b7a3e"
  for-line: "#7fd1a3"
  for-line-soft: "#cdeedb"
  for-tint: "#e6f7ed"
  for-wash: "#f3fbf6"
  against-text: "#c4320a"
  against-tint: "#fdeeea"
  sage: "#07703a"
  sage-bright: "#14ae5c"
  project-terracotta: "#e5533d"
  project-amber: "#f08c00"
  project-olive: "#7a9a01"
  project-sage: "#14ae5c"
  project-teal: "#0f9fa8"
  project-blue: "#0c8ce9"
  project-plum: "#9747ff"
  project-rose: "#e03e8c"
  sticky-yellow: "#ffef9f"
  sticky-pink: "#ffc9e0"
  sticky-green: "#c5f2d4"
  sticky-blue: "#c7e4ff"
  scrim-light: "rgba(0, 0, 0, .32)"
  scrim: "rgba(0, 0, 0, .5)"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  claim:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-ui:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.55
  control:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tnum"
  landing-hero:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(40px, 6.4vw, 76px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.04em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  canvas-inset: "16px"
  panel: "28px 32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-rust}"
  button-ghost:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "7px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  topbar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    height: "48px"
  tabs-segmented:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted-strong}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "3px"
  tab-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  nav-item-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.accent-rust}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  floating-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    padding: "10px"
  legend-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  zoom-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    size: "32px"
  web-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    width: "210px"
  web-card-hub:
    backgroundColor: "{colors.hub-ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.claim}"
    rounded: "{rounded.xl}"
    width: "300px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "28px 32px"
  toast:
    backgroundColor: "{colors.hub-ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
---

# Design System: Lattice

## Overview

**Creative North Star: "The Research Canvas"**

Lattice is the category standard for canvas-first tools, executed at the craft level of Figma, Miro and Obsidian's graph view. The idea web is a full-bleed, dotted, infinite canvas; everything that operates on it floats above it as white panels with 12px corners and a soft two-layer shadow. Every other tab (Cards, Sources, Question & history, Insights) is a calm, dense white panel in the same chrome. Conventions are embraced, not themed: a 48px top bar, a segmented tab control, a layer-list legend, a bottom-centre toolbar, zoom controls bottom-right, an inspector on the right.

The chrome is neutral and cool so that colour can carry meaning. One blue is reserved for selection, focus and primary actions. Saturated origin and relation colours only ever say where an idea came from or how two ideas relate, and they live in dots and lines, never in the words beside them. The hypothesis is the one dark object on the canvas: a charcoal hub card outlined in hypothesis magenta, which the eye finds first even from the back of a room.

All values live in `tokens.css` as CSS custom properties with the same names as the frontmatter keys (`--ink`, `--paper`, `--accent-strong`, `--origin-external`, `--fs-body`, `--radius-lg`, `--shadow-float`). The landing page (`landing.html`, `landing.css`) runs on the same tokens. The look must never feel playful and must read well projected, which is why the type scale bottoms out at 12px and text colours down to `--muted` pass WCAG AA on every surface. This world replaces the warm-paper, serif, terracotta "academic notebook" look; none of that vocabulary carries forward.

**Key Characteristics:**
- Full-bleed dotted canvas (`--paper` with a 24px dot grid in `--line-bold`) under floating white chrome.
- One UI typeface (Inter) at projector-friendly sizes; JetBrains Mono only for codes, counts and dates.
- One blue, for selection, focus and primary actions only.
- Origin and relation colours as dots and lines; words stay ink.
- Flat panels at rest; floating chrome and canvas cards carry soft two-layer shadows.
- A single dark object per canvas: the hypothesis hub.

## Colors

A neutral cool-grey chrome with one working blue and a small, strictly semantic set of saturated hues.

### Primary
- **Selection Blue** (`accent`): focus rings, selection outlines on canvas cards, the current project card's ring, input focus borders.
- **Action Blue** (`accent-strong`): the fill of every primary button (Add evidence, Accept, Open the beta) and link text; AA with white and on white. Hover deepens to **Pressed Blue** (`accent-rust`), which is also the active navigation label.
- **Blue washes** (`selected`, `accent-wash`, `accent-tint`): the active navigation row, text selection, quiet informational notices.

### Secondary: origins (where an idea came from)
- **External Violet** (`origin-external`): external sources.
- **Experiment Green** (`origin-experiment`): the user's own experiments.
- **Notice Amber** (`notice`): things that need attention (search matches, waiting-for-review and setup banners, out-of-date reads); `notice-text` is its readable text form. (It was the retired "My draft" origin colour.)
- **Hypothesis Magenta** (`origin-hypothesis`): hypothesis guesses, and the hairline around the dark hub card; `on-dark-accent` is its lightened form on dark ground.

### Tertiary: relations (how two ideas relate)
Always paired with a line style, so colour is never the only signal.
- **Supports Green** (`relation-supports`): solid line.
- **Contradicts Red** (`relation-contradicts`): dashed line; `against-text` and `against-tint` for its readable text and wash.
- **Refines Grey** (`relation-refines`): solid grey line.
- **Same-claim Purple** (`relation-same`): a doubled line.
- **Explains Teal** (`relation-explains`): solid teal line.
- `for-text`, `for-line`, `for-tint` carry the supports family into text, meters and washes.

### Neutral
- **Ink** (`ink`): headings and body text. `ink-soft` for strong secondary text and labels beside coloured dots; `ink-body` for running prose in panels.
- **Muted** (`muted-strong`, `muted`): secondary text, metadata, hints. `muted` is the quietest colour allowed for words.
- **Ornament Grey** (`ornament`): decorative strokes only.
- **Canvas Grey** (`paper`): the canvas and the page ground behind panels.
- **Panel White** (`card`, `field`, `sidebar-paper`): panels, floating chrome, cards, inputs, ghost buttons.
- **Quiet steps** (`raised`, `sunken`, `track`): hover rows and footers, wells and the segmented-tab track, empty meters.
- **Hairlines** (`line-soft`, `line`, `line-strong`, `line-bold`): dividers inside panels, card and panel borders, control outlines, hover borders and the canvas dots.
- **Charcoal** (`hub-ink`, `hub-ink-deep`): the hypothesis hub card, the toast, the landing CTA band and footer.
- **Sticky paper** (`sticky-yellow`, `sticky-pink`, `sticky-green`, `sticky-blue`): FigJam-style notes on the web.
- **Project tags** (`project-*`): the colour a user picks for a project, shown as a 10px dot.

### Named Rules
**The One Blue Rule.** `accent` and `accent-strong` mean selection, focus, or the primary action, and nothing else. A screen has one blue button; status, decoration and headings are never blue.

**The Colour Lives In Dots And Lines Rule.** Origin and relation colours only mean origin or relation, and they appear as dots, line strokes, meters and outlines. The words beside them stay in `ink-soft` or `ink`, so they pass AA at any size.

**The One Dark Object Rule.** The charcoal hub card with its magenta outline is the only dark object on the canvas. Outside the canvas, charcoal is used only for the toast and the landing page's closing CTA band and footer.

## Typography

**UI Font:** Inter (with system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Mono Font:** JetBrains Mono (with ui-monospace, Cascadia Mono, Consolas, monospace)

**Character:** One neutral, tightly tracked sans does every job, the way it does in Figma; weight and size carry hierarchy, never a second display face. The mono is a utility for things that are codes or numbers.

### Hierarchy
- **Display** (700, 44px `--fs-display`, 1.08, -0.03em): page headings outside a project (Projects, Library, Privacy, How it works, onboarding). The landing hero scales the same treatment to `clamp(40px, 6.4vw, 76px)` at -0.04em.
- **Headline** (700, 28px `--fs-title-l`, 1.2, -0.02em): panel headings inside a project tab.
- **Title** (700, 24px `--fs-title`, 1.25, -0.02em): the project title and section headings; 20px `--fs-title-s` for project names on cards.
- **Claim** (600, 18px `--fs-claim`, 1.3): hub-card guesses, the inspector heading, card questions; 600 at 16px `--fs-lead` for panel titles.
- **Body** (400, 14px `--fs-body`, 1.5): interface copy and canvas card text (500 at 1.38 on cards). Panel intros use 15px `--fs-ui` at 1.55 with a 68ch measure; navigation uses 15px at 500.
- **Control** (600 primary / 500 ghost, 13px `--fs-small`, 1.2): buttons, tabs, legend rows, breadcrumbs, field labels.
- **Label** (500, 12px `--fs-label`): metadata and counts; the floor of the scale.

### Named Rules
**The Twelve Pixel Floor Rule.** Nothing is set below `--fs-label` (12px). The app is judged on a projector.

**The Mono Means Numbers Rule.** JetBrains Mono is only for codes, counts, dates, the zoom percentage and keycaps (with tabular figures). Prose, labels and citations are set in Inter.

**The Sentence Case Rule.** Labels, tabs, buttons and headings are sentence case at normal tracking. No uppercase tracked labels.

## Layout

On wide screens (1100px and up) a sticky 48px white top bar carries the logo mark, breadcrumbs with the project switcher, the project tabs as a centred segmented control, and project actions on the right (icon-only ghost buttons, the pipeline status pill, and the one blue Add evidence). Below it the Web tab fills the window edge to edge (`calc(100vh - 48px)`). The canvas chrome floats 16px in from the edges: the legend panel and help card top-left (248px wide), the toolbar bottom-centre 20px up, the zoom HUD bottom-right, and a 360px inspector top-to-bottom on the right when a card is selected.

Other tabs sit in a 1240px workspace (24px 32px padding) holding one white panel with 28px 32px padding. Spacing runs on a 4px base, mostly 4, 8, 12, 16, 24 and 32. Content is dense but not cramped: stacked rows breathe at 8 to 12px, sections at 40px.

Responsive steps: under 1100px the tabs drop out of the top bar into the workspace and the tab row scrolls behind a fade. Under 900px the floating canvas chrome docks into a column above a bordered 62vh canvas. Under 850px the hover sidebar is replaced by a menu button. Under 650px headers stack. The landing page uses a 1200px column with 96 to 136px section gaps that tighten under 900px.

## Elevation & Depth

A hybrid: panels and lists are flat with hairline borders; anything that floats over the canvas, or lives on it, carries a soft two-layer shadow (a blur plus a 0.5px ring, so edges stay crisp when projected). Depth is a signal of "this sits above the work".

### Shadow Vocabulary
- **Rest** (`--shadow-rest`): barely-there lift for small static items.
- **Card** (`--shadow-card`): canvas cards, Insights cards, the help card, docked chrome on narrow screens.
- **Lift** (`--shadow-lift`): hover on canvas cards and project cards.
- **Control** (`--shadow-control`): the active segment in the tab control.
- **Float** (`--shadow-float`): floating canvas chrome (legend, toolbar, zoom HUD, inspector), sticky notes, the import queue.
- **Hub** (`--shadow-hub`): the dark hypothesis card only.
- **Overlay** (`--shadow-overlay`): the review deck card and dialogs.
- **Drawer / Sidebar** (`--shadow-drawer`, `--shadow-sidebar`): side sheets sliding over content.
- **Toast** (`--shadow-toast`): the toast.

### Named Rules
**The Float Means Chrome Rule.** `--shadow-float` belongs to tool chrome hovering over the canvas. Panels in the page flow stay flat with a `--line` border.

## Shapes

Gently rounded, tool-like rectangles. Controls, badges and inputs use 6px (`rounded.sm`); cards and list items 8px (`rounded.md`); panels and every floating chrome element 12px (`rounded.lg`); the hub card, dialogs, drawers and the deck card 16px (`rounded.xl`). Pills (`rounded.pill`) are for counts and status chips only; sticky notes use 4px. Borders are 1px hairlines; the hub's outline is a 2px magenta stroke. Origins also have shapes in the web (dots on cards, line styles on edges) so colour is never the only cue. Icons are one drawn set (`src/icons.js`): 16px viewBox, 1.6 stroke, round caps and joins, `currentColor`.

## Components

### Buttons
Quiet, compact and conventional.
- **Shape:** gently curved (6px).
- **Primary:** Action Blue fill, white 600 13px text, 8px 14px padding; hover to Pressed Blue over 0.12s. One per view. Disabled at 45% opacity.
- **Ghost:** white field, `line-strong` border, `ink-soft` 500 text, 7px 12px; hover raises the border to `line-bold` and the fill to `raised`.
- **Icon-only:** in the top bar and toolbars, transparent 32 to 34px squares that show `sunken` on hover.
- **Danger:** ghost with `against-text` label, washing to `against-tint` on hover.
- **Landing:** the same roles at 12px 20px, 8px radius, 15px.

### Segmented tabs
A `sunken` track (8px radius, 3px inset) holding transparent 13px tabs; the active tab is a white chip with `--shadow-control`. Counts beside tab names are mono and hide when space is short.

### Inputs / Fields
- **Style:** white field, 1px `line-strong` border, 6px radius, Inter; hover to `line-bold`.
- **Focus:** border to Selection Blue plus a 1px blue ring; no glow.
- **Labels:** 600 13px `ink-soft`, sentence case, optional hints in `muted` 400.

### Navigation
The 48px top bar (white, `line` bottom hairline) and a white hover-reveal sidebar of 15px 500 nav rows with 18px icons. Hover is `sunken`; the active row is `selected` with a Pressed Blue 600 label. Counts sit in mono `sunken` pills.

### Floating canvas chrome (signature)
White, 12px corners, `--shadow-float`, no border. The legend is a layer list: origin rows with a coloured dot and relation rows with a short line sample, label in `ink-soft`, count in mono `muted`; switched-off rows drop to 45% opacity. The toolbar holds search, Show all connections, Needs attention, Sticky note and Fit to view. The zoom HUD pairs minus/plus icon buttons with a mono percentage.

### Canvas cards (signature)
- **Evidence card:** 210px white card, 8px radius, `line` border, `--shadow-card`, lifting on hover; a metadata row (origin dot plus origin and citation) above 14px 500 claim text. Selection is a 2px blue outline offset by 2px.
- **Hypothesis hub:** 300px charcoal card, 16px radius, 2px Hypothesis Magenta stroke, `--shadow-hub`, 18px 600 white guess text, with for/against counts beneath.
- **Sticky note:** sticky paper, 4px radius, `--shadow-float`.

### Cards / Containers (outside the canvas)
- **Corner Style:** 12px panels and project cards, 8px list cards.
- **Background:** `card` on the `paper` ground; quotes sit in `raised` wells.
- **Shadow Strategy:** flat at rest; project cards and Insights cards lift on hover.
- **Border:** 1px `line`; the current project gets a blue ring.
- **Internal Padding:** 28px 32px for panels, 8 to 18px for cards.

### Toast
Charcoal, white 13px text, 8px radius, `--shadow-toast`, dropping in just below the top bar.

## Do's and Don'ts

### Do:
- **Do** take every value from `tokens.css` custom properties; styles carry no raw colours, and the JS colour maps are kept in step by `test/tokens.test.js`.
- **Do** use blue (`--accent` / `--accent-strong`) only for selection, focus and primary actions, with one primary button per view.
- **Do** put origin and relation colour in dots, line strokes and meters, and keep the words beside them in ink.
- **Do** pair every relation colour with its line style (solid, dashed, doubled).
- **Do** float canvas chrome: legend panel top-left, toolbar bottom-centre, zoom HUD bottom-right, inspector on the right, all white with 12px corners and `--shadow-float`.
- **Do** keep the project tabs and project actions in the 48px top bar on wide screens.
- **Do** write labels, tabs and buttons in sentence case.
- **Do** draw icons from the one set in `src/icons.js` (16px, 1.6 stroke, round caps).
- **Do** keep panels in the page flow flat with a 1px `--line` border.

### Don't:
- **Don't** set any text below `--fs-label` (12px).
- **Don't** use blue for status, decoration, headings or a second button.
- **Don't** colour words with origin or relation hues.
- **Don't** add a second dark object to the canvas; charcoal belongs to the hypothesis hub, the toast and the landing CTA band and footer.
- **Don't** put kickers or eyebrows above headings.
- **Don't** use mono for prose, labels or citations; it is for codes, counts and dates.
- **Don't** use Unicode glyphs (arrows, stars, check marks, bullets) as icons; draw them or take them from `src/icons.js`.
- **Don't** put thick coloured side borders on cards.
- **Don't** use `--ornament` for words; it is for decorative strokes only.
- **Don't** bring back the replaced world's warm paper, serif display face or terracotta accent.
