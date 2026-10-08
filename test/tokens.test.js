// The JS colour maps (origins, relations, project colours, sticky notes) mirror tokens.css as hex, because SVG
// attributes can't read CSS variables. These tests keep the two in step.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const tokens = Object.fromEntries([...read("tokens.css").matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));

// { key: "#hex" } pairs from an object literal written as `key: { ... colour: "#hex" ... }` or `key: "#hex"`.
const pairs = (source, pattern) => Object.fromEntries([...source.matchAll(pattern)].map(m => [m[1], m[2].toLowerCase()]));

test("origin colours match tokens.css", () => {
  const origins = pairs(read("src/origins.js"), /(\w+): \{[^}]*colour: "(#[0-9a-f]{6})"/gi);
  assert.deepEqual(Object.keys(origins).sort(), ["experiment", "external", "hypothesis"]);
  for (const [key, hex] of Object.entries(origins)) assert.equal(hex, tokens[`origin-${key}`], `origin ${key}`);
});

test("relation colours match tokens.css", () => {
  const relations = pairs(read("src/relations.js"), /(\w+): \{[^}]*colour: "(#[0-9a-f]{6})"/gi);
  assert.deepEqual(Object.keys(relations).sort(), ["contradicts", "explains", "refines", "same", "supports"]);
  for (const [key, hex] of Object.entries(relations)) assert.equal(hex, tokens[`relation-${key}`], `relation ${key}`);
});

test("project colours match tokens.css", () => {
  const block = read("src/state.js").match(/projectColours = \{([^}]*)\}/)[1];
  const colours = pairs(block, /(\w+): "(#[0-9a-f]{6})"/gi);
  assert.ok(Object.keys(colours).length >= 8);
  for (const [key, hex] of Object.entries(colours)) assert.equal(hex, tokens[`project-${key}`], `project ${key}`);
});

test("sticky note colours match tokens.css", () => {
  const block = read("src/web/web-view.js").match(/stickyColours = \{([^}]*)\}/)[1];
  const colours = pairs(block, /(\w+): "(#[0-9a-f]{6})"/gi);
  assert.deepEqual(Object.keys(colours).sort(), ["blue", "green", "pink", "yellow"]);
  for (const [key, hex] of Object.entries(colours)) assert.equal(hex, tokens[`sticky-${key}`], `sticky ${key}`);
});

test("styles.css uses tokens rather than raw colours", () => {
  assert.deepEqual(read("styles.css").match(/#[0-9a-f]{3,8}\b/gi) || [], []);
});
