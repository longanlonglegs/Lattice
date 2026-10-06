// Browser-side data helpers (src/records.js): card migration, store records, quote checks.
const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../src/records.js");

test("migrateCard turns an old flashcard into an evidence card", async () => {
  const { migrateCard } = await load();
  const old = { id: 7, tag: "Result", question: "What happened?", answer: "Oxygen sped up loss.", quote: "Oxygen sped up the loss of vitamin C.", page: "p. 2 · Haddad", sourceId: "s1", state: "approved", stance: "supports", revealed: true, editing: false };
  assert.deepEqual(migrateCard(old, { origin: "external" }), { id: 7, quote: "Oxygen sped up the loss of vitamin C.", sourceId: "s1", state: "approved", editing: false, claim: "Oxygen sped up loss.", location: "p. 2 · Haddad", origin: "external", note: "" });
});

test("migrateCard takes the origin from the source and leaves migrated cards alone", async () => {
  const { migrateCard } = await load();
  const migrated = migrateCard({ id: 1, answer: "A", quote: "Q", page: "p. 1", sourceId: "s" }, { origin: "experiment" });
  assert.equal(migrated.origin, "experiment");
  assert.deepEqual(migrateCard(migrated, { origin: "external" }), migrated);
  assert.equal(migrateCard({ id: 2, quote: "Q" }).origin, "external");
});

test("migrateWorkspace marks old own-work sources and their cards as experiments", async () => {
  const { migrateWorkspace } = await load();
  const ws = migrateWorkspace({ activeId: "p", projects: [{ id: "p", sources: [{ id: "a", kind: "work" }, { id: "b", kind: "pdf" }], cards: [{ id: 1, sourceId: "a", answer: "x", quote: "q", page: "p. 1" }, { id: 2, sourceId: "b", answer: "y", quote: "q", page: "p. 1" }] }] });
  assert.deepEqual(ws.projects[0].sources.map(source => source.origin), ["experiment", "external"]);
  assert.deepEqual(ws.projects[0].cards.map(card => card.origin), ["experiment", "external"]);
});

test("splitWorkspace and joinWorkspace round-trip a workspace", async () => {
  const { splitWorkspace, joinWorkspace } = await load();
  const ws = { activeId: "p2", projects: [
    { id: "p1", title: "One", activities: [{ id: "x" }], sources: [{ id: "s1" }, { id: "s2" }], cards: [{ id: 1, claim: "a" }, { id: 2, claim: "b" }] },
    { id: "p2", title: "Two", activities: [], sources: [], cards: [{ id: 1, claim: "same id, other project" }] }
  ] };
  const records = splitWorkspace(ws);
  assert.equal(records.cards.length, 3);
  assert.deepEqual(records.cards[2], { id: 1, claim: "same id, other project", projectId: "p2", order: 0 });
  // Stores return records in key order, not insertion order; order fields restore it.
  const shuffled = { ...records, sources: records.sources.slice().reverse(), cards: records.cards.slice().reverse(), projects: records.projects.slice().reverse() };
  assert.deepEqual(joinWorkspace(shuffled), ws);
});

test("quoteInPages matches ignoring case, spacing, and punctuation, on a single page", async () => {
  const { quoteInPages } = await load();
  const pages = [{ label: "p. 1", text: "Oxygen, not heat, drove the loss." }, { label: "p. 2", text: "Copper also mattered." }];
  assert.equal(quoteInPages("oxygen not heat drove the loss", pages), true);
  assert.equal(quoteInPages("Oxygen drove the loss", pages), false);
  assert.equal(quoteInPages("the loss. Copper also", pages), false);
  assert.equal(quoteInPages("", pages), false);
  assert.equal(quoteInPages("Oxygen, not heat … the loss.", pages), true);
  assert.equal(quoteInPages("the loss … Oxygen, not heat", pages), false);
});
